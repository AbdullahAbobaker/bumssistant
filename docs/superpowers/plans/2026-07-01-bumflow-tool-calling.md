# BumFlow Tool-Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let BumFlow call read-only actions (e.g. `list_projects`) mid-conversation by wiring the action registry in as LLM tools.

**Architecture:** New `ToolCall`/`ChatResult` types + a `tools` param on `LLMClient.chat` (returns `ChatResult`). `handle_turn` gains an optional tool loop driven by injected `tools` + `dispatch` (stays interface-only, DB-free). The `/chat` endpoint builds the read-only tool list and a dispatch closure over an `ActionContext`. `MockLLM` gets deterministic tool behavior; `LangdockLLM` gets real OpenAI-compatible function calling via pure helpers.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy async, httpx, pytest.

## Global Constraints

- Python 3.10+ syntax (`X | None`); all files use `from __future__ import annotations`.
- **Reliability bar (CLAUDE.md):** every module has pure, DB-free unit tests. Run `python -m pytest -q` before and after each task.
- Interpreter on this machine: `/Applications/anaconda3/bin/python` (the shell's `python3` is system 3.9 and lacks deps). Commands below say `python`; use that interpreter.
- Nothing imports Langdock outside `app/llm.py` (Decisions #5/#18).
- Read-only tools only in this cut (spec scope decision); dispatch defensively refuses non-read-only.
- Baseline: **18 tests passing** before starting.

---

### Task 1: LLM tool types (additive, non-breaking)

**Files:**
- Modify: `app/llm.py:11-23` (imports + `ChatMessage`)
- Test: `tests/test_llm_tools.py` (create)

**Interfaces:**
- Produces: `ToolCall(id: str, name: str, arguments: dict)`; `ChatResult(text: str | None = None, tool_calls: list[ToolCall] = [])`; `ChatMessage(role, content=None, tool_calls=None, tool_call_id=None)`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_llm_tools.py`:
```python
"""Pure, DB-free tests for LLM tool-calling types and behavior (app/llm.py)."""
from app.llm import ChatMessage, ChatResult, ToolCall


def test_tool_types_construct():
    tc = ToolCall(id="c1", name="list_projects", arguments={})
    assert tc.name == "list_projects" and tc.arguments == {}
    r_text = ChatResult(text="hi")
    assert r_text.text == "hi" and r_text.tool_calls == []
    r_call = ChatResult(tool_calls=[tc])
    assert r_call.text is None and r_call.tool_calls[0] is tc


def test_chat_message_carries_tool_fields():
    m = ChatMessage("tool", content="{}", tool_call_id="c1")
    assert m.role == "tool" and m.tool_call_id == "c1"
    a = ChatMessage("assistant", tool_calls=[ToolCall("c1", "x", {})])
    assert a.content is None and a.tool_calls[0].id == "c1"
    # positional (role, content) construction still works
    assert ChatMessage("user", "hallo").content == "hallo"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_tools.py -q`
Expected: FAIL — `ImportError: cannot import name 'ChatResult'`

- [ ] **Step 3: Write minimal implementation**

In `app/llm.py`, change the import line (was `from dataclasses import dataclass`):
```python
from dataclasses import dataclass, field
```
Replace the `ChatMessage` block (lines ~20-23) with:
```python
@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class ChatResult:
    text: str | None = None
    tool_calls: list["ToolCall"] = field(default_factory=list)  # empty ⇒ final answer


@dataclass
class ChatMessage:
    role: str                                   # 'system' | 'user' | 'assistant' | 'tool'
    content: str | None = None
    tool_calls: list["ToolCall"] | None = None  # assistant proposing calls
    tool_call_id: str | None = None             # links a role='tool' result to a call
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_llm_tools.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add app/llm.py tests/test_llm_tools.py
git commit -m "feat(llm): add ToolCall/ChatResult types and tool fields on ChatMessage"
```

---

### Task 2: Migrate `chat()` to return `ChatResult` + accept `tools`

Breaking-change task — kept atomic so the suite stays green. No tool *behavior* yet; `chat` just returns `ChatResult(text=...)` and accepts an ignored `tools` param. `handle_turn` reads `.text`.

**Files:**
- Modify: `app/llm.py` (`LLMClient` protocol, `MockLLM.chat`, `LangdockLLM.chat`)
- Modify: `app/chat/orchestrator.py:74` (read `result.text`)
- Test: `tests/test_llm_tools.py` (add)

**Interfaces:**
- Consumes: `ChatResult` (Task 1).
- Produces: `LLMClient.chat(system, messages, tools=None) -> ChatResult`; `MockLLM.chat`/`LangdockLLM.chat` same signature.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_llm_tools.py`:
```python
import asyncio
from app.llm import MockLLM


def test_mockllm_chat_returns_chatresult_text():
    out = asyncio.run(MockLLM(8).chat("sys", [ChatMessage("user", "Was steht an?")]))
    assert isinstance(out, ChatResult)
    assert out.tool_calls == []
    assert "Was steht an?" in (out.text or "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_tools.py::test_mockllm_chat_returns_chatresult_text -q`
Expected: FAIL — `AttributeError: 'str' object has no attribute 'tool_calls'`

- [ ] **Step 3: Write minimal implementation**

In `app/llm.py`, update the protocol:
```python
class LLMClient(Protocol):
    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> "ChatResult": ...
    async def embed(self, text: str) -> list[float]: ...
```
Replace `MockLLM.chat`:
```python
    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        last = messages[-1].content if messages else ""
        return ChatResult(text=f"[mock BumFlow] Verstanden. Nächster Schritt zu: {(last or '')[:80]}")
```
Replace `LangdockLLM.chat`:
```python
    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        payload = {
            "model": self._chat_model,
            "messages": [{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{self._base}/v1/chat/completions", json=payload, headers=self._headers
            )
            r.raise_for_status()
            return ChatResult(text=r.json()["choices"][0]["message"]["content"])
```
In `app/chat/orchestrator.py`, replace line 74 (`reply = await llm.chat(system, messages)`):
```python
    result = await llm.chat(system, messages)
    reply = result.text or ""
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest -q`
Expected: PASS (existing `test_full_turn_logs_replies_and_extracts_async` still green; new test passes)

- [ ] **Step 5: Commit**

```bash
git add app/llm.py app/chat/orchestrator.py tests/test_llm_tools.py
git commit -m "refactor(llm): chat() returns ChatResult and accepts tools param"
```

---

### Task 3: MockLLM deterministic tool behavior (trigger + scriptable)

**Files:**
- Modify: `app/llm.py` (`MockLLM.__init__`, `MockLLM.chat`)
- Test: `tests/test_llm_tools.py` (add)

**Interfaces:**
- Consumes: `ToolCall`, `ChatResult` (Task 1).
- Produces: `MockLLM(embedding_dim=1536, script: list[ChatResult] | None = None)`. If `script` set, each `chat` pops the next `ChatResult`. Else: if `list_projects` is offered AND the last user message contains `"projekt"` (case-insensitive) AND no `role="tool"` message is present, returns a single `list_projects` `ToolCall`; if a tool result is present, returns a text reply; otherwise the default reply.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_llm_tools.py`:
```python
_LIST_PROJECTS_TOOL = {"type": "function", "function": {"name": "list_projects", "description": "", "parameters": {}}}


def test_mockllm_triggers_list_projects_then_answers():
    m = MockLLM(8)
    # round 1: user mentions "Projekte" + tool offered -> emits the tool call
    r1 = asyncio.run(m.chat("sys", [ChatMessage("user", "Zeig meine Projekte")], tools=[_LIST_PROJECTS_TOOL]))
    assert r1.text is None and len(r1.tool_calls) == 1
    assert r1.tool_calls[0].name == "list_projects"
    # round 2: a tool result is now present -> returns text, no more calls
    msgs = [
        ChatMessage("user", "Zeig meine Projekte"),
        ChatMessage("assistant", tool_calls=r1.tool_calls),
        ChatMessage("tool", content="[]", tool_call_id=r1.tool_calls[0].id),
    ]
    r2 = asyncio.run(m.chat("sys", msgs, tools=[_LIST_PROJECTS_TOOL]))
    assert r2.tool_calls == [] and r2.text


def test_mockllm_no_trigger_without_tool_or_keyword():
    m = MockLLM(8)
    # keyword but no tool offered -> plain text
    assert asyncio.run(m.chat("sys", [ChatMessage("user", "meine Projekte")])).tool_calls == []
    # tool offered but no keyword -> plain text
    r = asyncio.run(m.chat("sys", [ChatMessage("user", "Hallo")], tools=[_LIST_PROJECTS_TOOL]))
    assert r.tool_calls == [] and r.text


def test_mockllm_script_drives_sequence():
    scripted = ChatResult(tool_calls=[ToolCall("c9", "list_projects", {})])
    m = MockLLM(8, script=[scripted, ChatResult(text="fertig")])
    assert asyncio.run(m.chat("s", [])).tool_calls[0].id == "c9"
    assert asyncio.run(m.chat("s", [])).text == "fertig"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_llm_tools.py -q`
Expected: FAIL — `MockLLM.__init__() got an unexpected keyword argument 'script'` / trigger asserts fail

- [ ] **Step 3: Write minimal implementation**

Replace the whole `MockLLM` class body in `app/llm.py` with:
```python
class MockLLM:
    """Deterministic, offline. Used on private laptops and in tests.

    Tool-calling is deterministic: a keyword trigger emits a list_projects call so the
    offline server can demo the loop, and a `script` seeds an exact response sequence for
    precise tests."""

    def __init__(self, embedding_dim: int = 1536, script: list["ChatResult"] | None = None) -> None:
        self._dim = embedding_dim
        self._script = list(script) if script is not None else None

    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        if self._script is not None:
            return self._script.pop(0)
        last = (messages[-1].content if messages else "") or ""
        tool_names = {t["function"]["name"] for t in (tools or [])}
        has_tool_result = any(m.role == "tool" for m in messages)
        if "list_projects" in tool_names and "projekt" in last.lower() and not has_tool_result:
            return ChatResult(tool_calls=[ToolCall(id="call_1", name="list_projects", arguments={})])
        if has_tool_result:
            return ChatResult(text="[mock BumFlow] Deine aktiven Projekte habe ich abgerufen.")
        return ChatResult(text=f"[mock BumFlow] Verstanden. Nächster Schritt zu: {last[:80]}")

    async def embed(self, text: str) -> list[float]:
        seed = hashlib.sha256(text.encode("utf-8")).digest()
        return [((seed[i % len(seed)] / 255.0) * 2 - 1) for i in range(self._dim)]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest -q`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add app/llm.py tests/test_llm_tools.py
git commit -m "feat(llm): deterministic MockLLM tool-calling (trigger + scriptable)"
```

---

### Task 4: Orchestrator tool loop

**Files:**
- Modify: `app/chat/orchestrator.py` (imports + `handle_turn`)
- Test: `tests/test_orchestrator_tools.py` (create)

**Interfaces:**
- Consumes: `ChatResult`, `ToolCall`, `ChatMessage` (`app/llm.py`); `MockLLM` (for tests).
- Produces: `handle_turn(user_id, user_text, *, port, llm, runner, tools=None, dispatch=None) -> str`. `dispatch: Callable[[ToolCall], Awaitable[Any]]`. Module constant `MAX_TOOL_ROUNDS = 3`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_orchestrator_tools.py`:
```python
"""Pure, DB-free tests for the orchestrator tool loop (app/chat/orchestrator.py)."""
import asyncio

from app.background import InProcessRunner
from app.chat.orchestrator import TurnContext, handle_turn
from app.chat.session import Msg
from app.llm import ChatMessage, ChatResult, MockLLM, ToolCall


class _Port:
    def __init__(self):
        self.log = []

    async def load_context(self, user_id, user_text):
        return TurnContext(display_name="Anna", coaching_style=None, rolling_summary="", recent=[])

    async def log_message(self, user_id, role, content):
        self.log.append((role, content))

    async def extract_memories(self, user_id, user_text, reply):
        pass


def test_tool_loop_dispatches_then_returns_final_text():
    async def run():
        calls = []

        async def dispatch(tc: ToolCall):
            calls.append(tc)
            return [{"id": "p1", "name": "Nordstern", "status": "active"}]

        llm = MockLLM(8, script=[
            ChatResult(tool_calls=[ToolCall("c1", "list_projects", {})]),
            ChatResult(text="Du hast 1 aktives Projekt: Nordstern."),
        ])
        reply = await handle_turn(
            "u1", "Zeig Projekte", port=_Port(), llm=llm, runner=InProcessRunner(),
            tools=[{"type": "function", "function": {"name": "list_projects"}}], dispatch=dispatch,
        )
        assert reply == "Du hast 1 aktives Projekt: Nordstern."
        assert len(calls) == 1 and calls[0].name == "list_projects"

    asyncio.run(run())


def test_dispatch_error_is_fed_back_not_raised():
    async def run():
        async def dispatch(tc: ToolCall):
            raise KeyError("unknown action: 'nope'")

        seen = {}

        class _SpyLLM(MockLLM):
            async def chat(self, system, messages, tools=None):
                seen["msgs"] = messages
                return await super().chat(system, messages, tools)

        llm = _SpyLLM(8, script=[
            ChatResult(tool_calls=[ToolCall("c1", "nope", {})]),
            ChatResult(text="Entschuldige, das ging nicht."),
        ])
        reply = await handle_turn(
            "u1", "x", port=_Port(), llm=llm, runner=InProcessRunner(),
            tools=[{"type": "function", "function": {"name": "list_projects"}}], dispatch=dispatch,
        )
        assert reply == "Entschuldige, das ging nicht."
        tool_msgs = [m for m in seen["msgs"] if m.role == "tool"]
        assert tool_msgs and "error" in tool_msgs[-1].content

    asyncio.run(run())


def test_no_tools_behaves_like_plain_chat():
    async def run():
        reply = await handle_turn(
            "u1", "Hallo", port=_Port(), llm=MockLLM(8), runner=InProcessRunner(),
        )
        assert reply and "Hallo" in reply

    asyncio.run(run())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_orchestrator_tools.py -q`
Expected: FAIL — `handle_turn() got an unexpected keyword argument 'tools'`

- [ ] **Step 3: Write minimal implementation**

In `app/chat/orchestrator.py`, update imports (top of file):
```python
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.background import TaskRunner
from app.chat.session import Msg, build_window
from app.llm import ChatMessage, LLMClient, ToolCall
from app.memory.retrieval import Candidate, select_for_context
from app.persona import build_system_prompt

MAX_TOOL_ROUNDS = 3
```
Replace the whole `handle_turn` function with:
```python
async def handle_turn(
    user_id: str,
    user_text: str,
    *,
    port: ChatPort,
    llm: LLMClient,
    runner: TaskRunner,
    tools: list[dict] | None = None,
    dispatch: Callable[[ToolCall], Awaitable[Any]] | None = None,
) -> str:
    # 1. Immediate logging (Decision #17).
    await port.log_message(user_id, "user", user_text)

    # 2. Retrieve: always-on core + score-fused top memories.
    ctx = await port.load_context(user_id, user_text)

    # 3. Build BumFlow's prompt: persona + tone + confirmed memory.
    system = build_system_prompt(
        ctx.coaching_style,
        confirmed_memory_summary=_compose_memory_block(ctx),
        user_name=ctx.display_name,
    )
    if ctx.rolling_summary:
        system += f"\n\nBisheriges Gespräch (Zusammenfassung):\n{ctx.rolling_summary}"

    # 4. Assemble bounded window + the new turn.
    window = build_window(ctx.recent, ctx.rolling_summary)
    messages = [ChatMessage(m.role, m.content) for m in window.recent]
    messages.append(ChatMessage("user", user_text))

    # 5. Call the LLM. With tools, run a bounded tool loop; otherwise a single call.
    if tools and dispatch:
        reply = "Ich konnte das gerade nicht abschließen."
        for _ in range(MAX_TOOL_ROUNDS):
            result = await llm.chat(system, messages, tools=tools)
            if not result.tool_calls:
                reply = result.text or ""
                break
            messages.append(ChatMessage("assistant", tool_calls=result.tool_calls))
            for tc in result.tool_calls:
                try:
                    out = await dispatch(tc)
                except Exception as e:  # bad tool call never crashes the turn
                    out = {"error": str(e)}
                messages.append(
                    ChatMessage("tool", content=json.dumps(out, ensure_ascii=False), tool_call_id=tc.id)
                )
    else:
        result = await llm.chat(system, messages)
        reply = result.text or ""

    # 6. Log the reply, then learn in the background (never block the user).
    await port.log_message(user_id, "assistant", reply)
    runner.run_later(port.extract_memories(user_id, user_text, reply))
    return reply
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest -q`
Expected: PASS (all — existing orchestrator test unaffected by the new optional params)

- [ ] **Step 5: Commit**

```bash
git add app/chat/orchestrator.py tests/test_orchestrator_tools.py
git commit -m "feat(chat): bounded tool loop in handle_turn via injected tools+dispatch"
```

---

### Task 5: Dispatch helper + `/chat` wiring

**Files:**
- Create: `app/actions/dispatch.py`
- Modify: `app/main.py` (imports + `/chat` body)
- Test: `tests/test_action_dispatch.py` (create)

**Interfaces:**
- Consumes: `registry`, `ActionContext` (`app/actions/base.py`); `ToolCall` (`app/llm.py`); built-in actions (via `import app.actions`).
- Produces: `dispatch_tool_call(tc: ToolCall, ctx: ActionContext) -> Any` — resolves the action, refuses non-read-only (`PermissionError`), invokes, returns a JSON-able result. Helper `_to_jsonable(result) -> Any`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_action_dispatch.py`:
```python
"""Pure, DB-free tests for tool dispatch safety (app/actions/dispatch.py).

Unknown/write tools are rejected BEFORE the handler runs, so no DB is needed.
"""
import asyncio

import pytest

from app.actions import registry  # noqa: F401  triggers built-in registration
from app.actions.dispatch import _to_jsonable, dispatch_tool_call
from app.llm import ToolCall
from pydantic import BaseModel


def test_unknown_tool_raises_keyerror():
    with pytest.raises(KeyError):
        asyncio.run(dispatch_tool_call(ToolCall("c1", "does_not_exist", {}), ctx=None))


def test_write_tool_refused_before_db():
    # create_task is read_only=False -> refused before invoke, so ctx=None never used
    with pytest.raises(PermissionError):
        asyncio.run(dispatch_tool_call(ToolCall("c1", "create_task", {"title": "x"}), ctx=None))


def test_to_jsonable_handles_pydantic_and_lists():
    class M(BaseModel):
        a: int

    assert _to_jsonable([M(a=1), M(a=2)]) == [{"a": 1}, {"a": 2}]
    assert _to_jsonable(M(a=3)) == {"a": 3}
    assert _to_jsonable({"x": 1}) == {"x": 1}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_action_dispatch.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.actions.dispatch'`

- [ ] **Step 3: Write minimal implementation**

Create `app/actions/dispatch.py`:
```python
"""Tool dispatch (proposed Decision #21, step 3): resolve a model tool call to an action
and run it. Safety lives here — non-read-only tools are refused before any handler runs.
Used by the /chat endpoint to build the dispatch closure handed to the orchestrator.
"""
from __future__ import annotations

from typing import Any

from app.actions.base import ActionContext, registry
from app.llm import ToolCall


def _to_jsonable(result: Any) -> Any:
    """Convert action results (Pydantic models / lists thereof) to JSON-able data so the
    orchestrator can serialize them back to the model."""
    if isinstance(result, list):
        return [r.model_dump(mode="json") if hasattr(r, "model_dump") else r for r in result]
    return result.model_dump(mode="json") if hasattr(result, "model_dump") else result


async def dispatch_tool_call(tc: ToolCall, ctx: ActionContext) -> Any:
    act = registry.get(tc.name)                       # KeyError if unknown
    if not act.read_only:                             # defense in depth (only read-only offered)
        raise PermissionError(f"non-read-only tool refused: {tc.name}")
    return _to_jsonable(await act.invoke(tc.arguments, ctx))
```
In `app/main.py`, add to the import block (after `from app.actions.http import mount_actions`):
```python
from app.actions import registry
from app.actions.base import ActionContext
from app.actions.dispatch import dispatch_tool_call
from app.llm import ToolCall
```
Replace the `/chat` body (lines ~62-66) with:
```python
    user_id = await get_or_create_user(session, user)
    llm = get_llm(settings)
    port = DbChatPort(SessionLocal, llm)
    tools = registry.tool_schemas(read_only=True)
    ctx = ActionContext(
        current_user=user, user_id=user_id, session_factory=SessionLocal, llm=llm
    )

    async def dispatch(tc: ToolCall):
        return await dispatch_tool_call(tc, ctx)

    reply = await handle_turn(
        user_id, req.message, port=port, llm=llm, runner=get_runner(),
        tools=tools, dispatch=dispatch,
    )
    return ChatResponse(reply=reply)
```

- [ ] **Step 4: Run tests + import check**

Run: `python -m pytest -q`
Expected: PASS (all)
Run: `python -c "import app.main; print('routes ok')"`
Expected: `routes ok`

- [ ] **Step 5: Commit**

```bash
git add app/actions/dispatch.py app/main.py tests/test_action_dispatch.py
git commit -m "feat(actions): tool dispatch helper + wire read-only tools into /chat"
```

---

### Task 6: LangdockLLM real tool-calling (pure helpers)

**Files:**
- Modify: `app/llm.py` (add `import json`, `_build_payload`, `_parse_result`, `LangdockLLM.chat`)
- Test: `tests/test_llm_tools.py` (add)

**Interfaces:**
- Consumes: `ChatMessage`, `ChatResult`, `ToolCall` (Task 1).
- Produces: module functions `_build_payload(model, system, messages, tools=None) -> dict` and `_parse_result(data: dict) -> ChatResult`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_llm_tools.py`:
```python
from app.llm import _build_payload, _parse_result


def test_build_payload_serializes_tools_and_tool_messages():
    msgs = [
        ChatMessage("user", "Zeig Projekte"),
        ChatMessage("assistant", tool_calls=[ToolCall("c1", "list_projects", {"x": 1})]),
        ChatMessage("tool", content="[]", tool_call_id="c1"),
    ]
    tools = [{"type": "function", "function": {"name": "list_projects", "parameters": {}}}]
    p = _build_payload("claude-sonnet-5", "sys", msgs, tools)
    assert p["messages"][0] == {"role": "system", "content": "sys"}
    asst = p["messages"][2]
    assert asst["tool_calls"][0]["function"]["name"] == "list_projects"
    # arguments are serialized as a JSON string on the wire
    assert asst["tool_calls"][0]["function"]["arguments"] == '{"x": 1}'
    assert p["messages"][3] == {"role": "tool", "content": "[]", "tool_call_id": "c1"}
    assert p["tools"] == tools


def test_parse_result_text_and_tool_calls():
    text = _parse_result({"choices": [{"message": {"content": "hallo"}}]})
    assert text.text == "hallo" and text.tool_calls == []
    call = _parse_result({"choices": [{"message": {"content": None, "tool_calls": [
        {"id": "c1", "function": {"name": "list_projects", "arguments": '{"x": 1}'}}
    ]}}]})
    assert call.text is None
    assert call.tool_calls[0].name == "list_projects" and call.tool_calls[0].arguments == {"x": 1}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_llm_tools.py -q`
Expected: FAIL — `ImportError: cannot import name '_build_payload'`

- [ ] **Step 3: Write minimal implementation**

In `app/llm.py`, add `import json` near the top imports (after `import hashlib`). Add these module-level functions just above the `LangdockLLM` class:
```python
def _build_payload(
    model: str, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
) -> dict:
    """Serialize to the OpenAI-compatible chat/completions wire shape (incl. tool calls)."""
    wire: list[dict] = [{"role": "system", "content": system}]
    for m in messages:
        if m.tool_calls:
            wire.append({
                "role": m.role,
                "content": m.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)},
                    }
                    for tc in m.tool_calls
                ],
            })
        elif m.tool_call_id:
            wire.append({"role": m.role, "content": m.content, "tool_call_id": m.tool_call_id})
        else:
            wire.append({"role": m.role, "content": m.content})
    payload: dict = {"model": model, "messages": wire}
    if tools:
        payload["tools"] = tools
    return payload


def _parse_result(data: dict) -> ChatResult:
    """Turn an OpenAI-compatible response into a ChatResult (text or tool calls)."""
    msg = data["choices"][0]["message"]
    raw_calls = msg.get("tool_calls") or []
    if raw_calls:
        return ChatResult(tool_calls=[
            ToolCall(
                id=c["id"],
                name=c["function"]["name"],
                arguments=json.loads(c["function"]["arguments"] or "{}"),
            )
            for c in raw_calls
        ])
    return ChatResult(text=msg.get("content"))
```
Replace `LangdockLLM.chat` (from Task 2) with:
```python
    async def chat(
        self, system: str, messages: list[ChatMessage], tools: list[dict] | None = None
    ) -> ChatResult:
        payload = _build_payload(self._chat_model, system, messages, tools)
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{self._base}/v1/chat/completions", json=payload, headers=self._headers
            )
            r.raise_for_status()
            return _parse_result(r.json())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest -q`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add app/llm.py tests/test_llm_tools.py
git commit -m "feat(llm): LangdockLLM OpenAI-compatible tool-calling via pure helpers"
```

---

## Final verification

- [ ] Run full suite: `python -m pytest -q` — expected: all green (was 18; +~11 new).
- [ ] Import check: `python -c "import app.main; print(sorted({r.path for r in app.main.app.routes if hasattr(r,'path')}))"` — `/chat`, `/actions`, `/actions/{name}` present.
- [ ] (Optional, needs DB up on :5433 + server on :8001) manual smoke: `curl -s -X POST localhost:8001/chat -H 'content-type: application/json' -d '{"message":"Zeig mir meine Projekte"}'` — MockLLM triggers `list_projects`, loops, returns text.

## Spec coverage map

| Spec section | Task |
|---|---|
| §1 LLM types (ToolCall/ChatResult/ChatMessage) | 1 |
| §1 `chat(tools=…) -> ChatResult` | 2 |
| §2 Orchestrator tool loop + try/except | 4 |
| §3 Dispatch closure + read-only refusal | 5 |
| §4 MockLLM trigger + scriptable | 3 |
| §5 LangdockLLM real protocol + pure helpers | 6 |
| §6 Tests (5 groups) | 1,3 (MockLLM+types), 4 (loop), 5 (dispatch safety), 6 (Langdock helpers) |
| Error handling (unified path) | 4 (loop try/except) + 5 (raises) |
