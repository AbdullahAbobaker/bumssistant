# Design: Write-as-tool (Action primitive, step 4)

**Date:** 2026-07-01
**Status:** Approved (brainstorming) — ready for implementation plan
**Relates to:** Decision #21 (Action primitive) + its step-3 tool-calling; Decision #8
(propose-then-confirm); Decision #14 (BumFlow guardrails); Decision #17 (batched review panel).

## Goal

Let BumFlow call *write* actions mid-conversation — safely. Today `/chat` offers only
read-only tools and dispatch refuses non-read-only. This adds exactly one model-invocable
write, `create_task`, whose model-initiated calls land `status='proposed'` (inert until the
user confirms). The model **suggests**; it never **asserts**.

## Scope decisions (settled in brainstorming)

- **Model may create tasks, as `proposed` only.** Reconciles #14 ("never invent tasks") with
  #8: a model-initiated `create_task` is a suggestion the user must confirm, not a fact.
- **`confirm_memory` is NOT model-invocable.** The model confirming its own proposals would
  defeat the gate. It stays a user-only action, blocked at two layers.
- **Approach A+A:** provenance via a new `ActionContext.initiator` field; agent-tool gating via
  a new `Action.agent_writable` flag. (Rejected: separate `propose_task` action — duplicates
  logic; forcing `proposed` in the dispatch layer — leaky; name-based allowlists — brittle.)

## Architecture

### 1. `Action.agent_writable` + `registry.agent_tool_schemas()` (`app/actions/base.py`)

Add `agent_writable: bool = False` to the `Action` dataclass. The set of tools offered to (and
runnable by) BumFlow is defined by ONE predicate — offer only what you will dispatch:

```python
def _is_agent_tool(a: Action) -> bool:
    return a.read_only or a.agent_writable

# on Registry:
def agent_tool_schemas(self) -> list[dict]:
    return [a.tool_schema() for a in self._actions.values() if _is_agent_tool(a)]
```

`@action(...)` gains an `agent_writable: bool = False` parameter, passed through to the `Action`.

### 2. `ActionContext.initiator` (`app/actions/base.py`)

```python
@dataclass
class ActionContext:
    current_user: "CurrentUser"
    user_id: str
    session_factory: "Callable[[], AsyncSession]"
    llm: "LLMClient"
    initiator: str = "user"        # "user" (HTTP /actions, CLI) | "agent" (BumFlow tool-call)
```

Default `"user"` keeps every existing construction site behaving as today.

### 3. `create_task` provenance branch (`app/actions/builtin.py`)

`create_task` is declared `agent_writable=True`. A pure helper decides provenance from the
initiator (extracted so it is DB-free unit-testable):

```python
def _task_provenance(initiator: str) -> tuple[str, float, str]:
    """(source, confidence, status) for a create_task call."""
    if initiator == "agent":
        return ("ai_inferred", 0.7, "proposed")   # model suggests; user confirms (#8)
    return ("user_explicit", 1.0, "confirmed")    # user acted directly (today's behavior)
```

The handler uses it: `source, confidence, status = _task_provenance(ctx.initiator)`, and sets
`confirmed_at = now()` only when `status == 'confirmed'` (NULL for proposed). No `memory_source`
enum change — `ai_inferred` already exists. `confirm_memory` is unchanged and NOT agent_writable.

### 4. Dispatch gate (`app/actions/dispatch.py`)

Replace the read-only refusal with the agent-tool predicate, and stop echoing the internal
action name into the model-visible error (deferred Minor #4 — now reachable):

```python
async def dispatch_tool_call(tc: ToolCall, ctx: ActionContext) -> Any:
    act = registry.get(tc.name)                    # KeyError if unknown
    if not (act.read_only or act.agent_writable):  # confirm_memory etc. refused here
        raise PermissionError("tool not permitted")  # no internal name leaked to the model
    return _to_jsonable(await act.invoke(tc.arguments, ctx))
```

### 5. `/chat` wiring (`app/main.py`)

Offer `registry.agent_tool_schemas()` (was `tool_schemas(read_only=True)`) and build the
dispatch context with `initiator="agent"`:

```python
tools = registry.agent_tool_schemas()
ctx = ActionContext(current_user=user, user_id=user_id,
                    session_factory=SessionLocal, llm=llm, initiator="agent")
```

The HTTP `POST /actions/{name}` path and the CLI keep `initiator="user"` (default) — a user
acting directly still auto-confirms.

## Data flow (model creates a task)

1. BumFlow (via `agent_tool_schemas`) is offered `create_task`.
2. Model emits a `create_task` tool call → orchestrator loop → dispatch closure (initiator=agent).
3. `dispatch_tool_call` permits it (`agent_writable`), invokes the handler.
4. Handler inserts the memory with `source='ai_inferred', confidence=0.7, status='proposed',
   confirmed_at=NULL`.
5. Result returns to the model as a tool result; the task is inert until the user confirms it in
   the batched review panel (#17) — exactly the personal propose-then-confirm path (#8).

## Error handling

- Unknown / non-permitted tool → raised in dispatch, caught by the orchestrator's try/except,
  fed back as an `{"error": ...}` tool result (never a crash). Error text carries no internal
  action name.
- `create_task` validation error (missing title) → same path, structured error to the model.

## Testing (all pure, DB-free — CLAUDE.md bar)

1. `ActionContext.initiator` defaults to `"user"`.
2. `agent_tool_schemas()` includes `list_projects` (read-only) and `create_task`
   (agent_writable), and **excludes** `confirm_memory`.
3. `_task_provenance("agent")` → `("ai_inferred", 0.7, "proposed")`;
   `_task_provenance("user")` → `("user_explicit", 1.0, "confirmed")`.
4. `dispatch_tool_call` refuses `confirm_memory` with `PermissionError` (before any DB call;
   `ctx=None` never dereferenced), and the message contains no internal action name.
5. `@action(agent_writable=True)` sets the flag on the registered `Action`.

## Out of scope (future cuts)

- Broader model-writable actions (e.g. updating task state) — same pattern when needed.
- Any model path to `confirm_memory` / promotion (#22) — always human-gated.
- A confirmation UI beyond the existing batched review panel (#17).
