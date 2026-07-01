# Design: BumFlow tool-calling (Action primitive, step 3)

**Date:** 2026-07-01
**Status:** Approved (brainstorming) — ready for implementation plan
**Relates to:** proposed Decision #21 (Action primitive); Decisions #5/#18 (LLM gateway),
#8 (propose-then-confirm), #12 (proactive informational-only), #14 (BumFlow guardrails),
#20 (orchestrator depends only on interfaces).

## Goal

Let BumFlow *call actions mid-conversation* instead of only talking. Wire the existing
action registry (`app/actions/`) in as LLM tools so the model can, e.g., look up the user's
projects to ground a reply. This is step 3 of the Action-primitive migration path.

## Scope decisions (settled in brainstorming)

- **Read-only tools only.** BumFlow is offered `registry.tool_schemas(read_only=True)` (today:
  `list_projects`). No mutation path in this cut, so guardrails #14/#8/#12 are structurally
  safe — the model literally cannot create/confirm memory. Write-as-tool is a future cut.
- **Mock now, real in prod.** `LangdockLLM` gets a correct OpenAI-compatible tool protocol so
  production works once a key is set (Decision #18). Local dev + all tests run on `MockLLM` —
  no key needed, offline, DSGVO-safe (Decision #11). `get_llm()` is unchanged.
- **Approach A — inject `tools` + `dispatch` into the orchestrator.** `handle_turn` owns the
  tool loop but stays decoupled: it receives a `tools` list and a `dispatch` callable and knows
  nothing about the registry, `ActionContext`, or the DB. Keeps the orchestrator interface-only
  (#20) and fully DB-free-testable. Rejected alternatives: passing the registry+context into the
  orchestrator (couples the spine to actions+DB); running the loop inside `LLMClient` (breaks the
  Langdock seam).

## Architecture

### 1. LLM types (`app/llm.py`)

```python
@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict

@dataclass
class ChatResult:
    text: str | None            # final answer, or None when the model wants tools
    tool_calls: list[ToolCall]  # empty ⇒ final answer; non-empty ⇒ run these and loop
```

`ChatMessage` gains two optional fields for the OpenAI-compatible message shape:
```python
@dataclass
class ChatMessage:
    role: str                              # 'system' | 'user' | 'assistant' | 'tool'
    content: str | None = None
    tool_calls: list[ToolCall] | None = None   # assistant proposing calls
    tool_call_id: str | None = None            # links a role='tool' result to a call
```

`LLMClient` protocol:
```python
async def chat(self, system: str, messages: list[ChatMessage],
               tools: list[dict] | None = None) -> ChatResult: ...
async def embed(self, text: str) -> list[float]: ...
```
When `tools` is None/empty, `tool_calls` is always empty and `text` holds the reply.

### 2. Tool loop (`app/chat/orchestrator.py`)

`handle_turn` gains optional `tools` and `dispatch` parameters. When both are absent it behaves
exactly as today (single `chat`, return text) — preserving the current test.

```
tools present → loop up to MAX_TOOL_ROUNDS (3):
    result = await llm.chat(system, messages, tools=tools)
    if not result.tool_calls:
        reply = result.text; break
    messages.append(ChatMessage("assistant", tool_calls=result.tool_calls))
    for tc in result.tool_calls:
        try:
            out = await dispatch(tc)                  # JSON-serializable result
        except Exception as e:
            out = {"error": str(e)}                   # fed back so the model can recover
        messages.append(ChatMessage("tool", content=json(out), tool_call_id=tc.id))
else:  # loop exhausted without a final answer
    reply = last result.text or a graceful fallback line
```

`dispatch(tc: ToolCall) -> Any` is supplied by the caller. The orchestrator wraps each call in
try/except and converts any exception into an `{"error": ...}` tool result — so a bad tool call
never crashes the turn, and the model gets a chance to recover. The orchestrator itself never
touches the registry or DB.

### 3. Dispatch closure (`app/main.py`, `/chat`)

```python
tools = registry.tool_schemas(read_only=True)
async def dispatch(tc: ToolCall):
    act = registry.get(tc.name)
    if not act.read_only:                     # defense in depth (only read-only offered)
        raise PermissionError(f"non-read-only tool refused: {tc.name}")
    ctx = ActionContext(current_user=user, user_id=user_id,
                        session_factory=SessionLocal, llm=llm)
    return await act.invoke(tc.arguments, ctx)
reply = await handle_turn(user_id, req.message, port=port, llm=llm,
                          runner=get_runner(), tools=tools, dispatch=dispatch)
```
The closure may raise (`KeyError` for an unknown tool, `PermissionError` for a write tool,
`ValidationError` for bad args). The orchestrator's try/except (§2) converts any such exception
into an `{"error": ...}` tool result fed back to the model — never a 500.

### 4. MockLLM (offline + tests)

- **Deterministic trigger:** if the latest user message contains `"projekt"` (case-insensitive)
  AND `list_projects` is among the offered tools AND no tool result is already present in the
  messages, return a `ChatResult` with one `list_projects` `ToolCall`. On the next round (tool
  result present) return text that incorporates the result. Otherwise reply as today.
- **Scriptable:** an optional constructor arg seeds an explicit queue of `ChatResult`s, so tests
  drive precise multi-round sequences deterministically.

### 5. LangdockLLM (production)

Real OpenAI-compatible function calling:
- Request: include `tools` in the payload; serialize `ChatMessage`s (including assistant
  `tool_calls` and `role="tool"` results) to the OpenAI wire shape.
- Response: parse `choices[0].message` — either `content` (→ `ChatResult(text=...)`) or
  `tool_calls` (→ `ChatResult(tool_calls=[...])`).
- The payload-build and response-parse steps are **pure functions** (`_build_payload`,
  `_parse_result`) so they unit-test without network.

## Error handling

All dispatch failures follow one path: the closure raises, the orchestrator's try/except (§2)
converts it to an `{"error": ...}` tool result fed back to the model. Never a crash, never a 500.
- **Unknown tool** → `registry.get` raises `KeyError` → error result; model can recover.
- **Non-read-only tool** → `PermissionError` (should never happen; only read-only offered).
- **Action raises / validation error** → error result.
- **Loop cap reached** → return the last text or a fallback message; never loop unbounded.

## Testing (all pure, DB-free — CLAUDE.md bar)

1. **Orchestrator loop:** scripted mock (round 1 → tool call, round 2 → text) + fake `dispatch`;
   assert dispatch invoked with the right args, tool result appended, final text returned.
2. **No-tools backward compatibility:** `handle_turn` with no `tools` behaves as today.
3. **MockLLM:** trigger emits a `list_projects` call then text; scripted queue drives sequences.
4. **LangdockLLM helpers:** `_build_payload` includes tools + serializes tool messages;
   `_parse_result` handles both text and tool-call responses.
5. **Dispatch safety:** refuses a non-read-only tool; unknown tool → structured error.

## Out of scope (future cuts)

- Write actions as tools (create_task/confirm_memory) — needs model-vs-user provenance and the
  propose-then-confirm gate wired into the tool path (#8).
- Streaming responses; parallel tool calls beyond the simple sequential loop.
- MCP adapter over the registry.
