# Write-as-tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let BumFlow call `create_task` mid-conversation, landing model-initiated tasks as `status='proposed'` (Decision #8), while `confirm_memory` stays off-limits to the model.

**Architecture:** Add `Action.agent_writable` (a curated write-allowlist flag) and `registry.agent_tool_schemas()` (offers `read_only or agent_writable`); add `ActionContext.initiator` so `create_task` picks provenance (`agent`→proposed, `user`→confirmed) via a pure `_task_provenance` helper; change the dispatch gate to the same `read_only or agent_writable` predicate (and stop leaking the internal action name); wire `/chat` to offer `agent_tool_schemas()` with `initiator="agent"`.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy async, pytest.

## Global Constraints

- Python 3.10+ syntax; files use `from __future__ import annotations`.
- Reliability bar (CLAUDE.md): pure DB-free unit tests. Test interpreter: `/Applications/anaconda3/bin/python`; run `python -m pytest -q` via it before/after each task.
- Decision #8: model-initiated writes land `status='proposed'`, never auto-confirmed. Decision #14: model may suggest, never assert. `confirm_memory` must NOT be model-invocable (refused at offering AND dispatch).
- No `memory_source` enum change — `ai_inferred` already exists.
- Baseline: **33 tests passing** before starting.
- **Sequencing note:** `create_task` becomes `agent_writable=True` in Task 1, but the dispatch gate still refuses it (checks only `read_only`) until Task 4 — so the suite stays green throughout. Task 4 flips the gate AND updates the one test that asserted `create_task` is refused.

---

### Task 1: `agent_writable` flag + `agent_tool_schemas()` + mark `create_task`

**Files:**
- Modify: `app/actions/base.py` (`Action` dataclass, `action` decorator, `Registry`)
- Modify: `app/actions/builtin.py:61-65` (`create_task` decorator)
- Test: `tests/test_actions.py` (add)

**Interfaces:**
- Produces: `Action(..., agent_writable: bool = False)`; `action(*, name, description, read_only=False, agent_writable=False)`; `Registry.agent_tool_schemas() -> list[dict]` (schemas where `read_only or agent_writable`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_actions.py`:
```python
def test_action_agent_writable_flag():
    assert Action("x", "d", _In, _handler).agent_writable is False
    assert Action("y", "d", _In, _handler, agent_writable=True).agent_writable is True


def test_agent_tool_schemas_offers_reads_and_agent_writes_only():
    names = {t["function"]["name"] for t in registry.agent_tool_schemas()}
    assert "list_projects" in names   # read-only
    assert "create_task" in names     # agent_writable
    assert "confirm_memory" not in names  # neither -> never offered to the model
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_actions.py -q`
Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'agent_writable'` / `AttributeError: 'Registry' object has no attribute 'agent_tool_schemas'`

- [ ] **Step 3: Write minimal implementation**

In `app/actions/base.py`, add the field to `Action` (after `read_only: bool = False`):
```python
    read_only: bool = False
    agent_writable: bool = False  # a WRITE action BumFlow may call (self-gates to 'proposed')
```
Add the `agent_tool_schemas` method to `Registry` (after `tool_schemas`):
```python
    def agent_tool_schemas(self) -> list[dict]:
        """Tools BumFlow may call: read-only actions PLUS explicitly agent-writable ones
        (which self-gate to 'proposed'). Offer only what dispatch will run."""
        return [
            a.tool_schema()
            for a in self._actions.values()
            if a.read_only or a.agent_writable
        ]
```
Update the `action` decorator signature and the `Action(...)` construction:
```python
def action(
    *, name: str, description: str, read_only: bool = False, agent_writable: bool = False
) -> Callable[[Handler], Handler]:
    """Register an async `handler(inp: PydanticModel, ctx: ActionContext)` as an Action.
    The input model is read from the handler's first parameter annotation."""

    def deco(fn: Handler) -> Handler:
        params = list(inspect.signature(fn).parameters)
        if len(params) < 2:
            raise TypeError(f"action {name!r}: handler must take (inp, ctx)")
        hints = typing.get_type_hints(fn)
        input_model = hints.get(params[0])
        if not (isinstance(input_model, type) and issubclass(input_model, BaseModel)):
            raise TypeError(
                f"action {name!r}: first parameter must be annotated with a Pydantic model"
            )
        registry.register(
            Action(
                name=name,
                description=description,
                input_model=input_model,
                handler=fn,
                read_only=read_only,
                agent_writable=agent_writable,
            )
        )
        return fn

    return deco
```
In `app/actions/builtin.py`, add `agent_writable=True` to `create_task`'s decorator:
```python
@action(
    name="create_task",
    description="Lege eine Aufgabe für die Person an.",
    read_only=False,
    agent_writable=True,
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — the existing `test_write_tool_refused_before_db` still passes: dispatch still checks only `read_only`, so `create_task` remains refused until Task 4)

- [ ] **Step 5: Commit**

```bash
git add app/actions/base.py app/actions/builtin.py tests/test_actions.py
git commit -m "feat(actions): add agent_writable flag + agent_tool_schemas; mark create_task"
```

---

### Task 2: `ActionContext.initiator`

**Files:**
- Modify: `app/actions/base.py` (`ActionContext` dataclass)
- Test: `tests/test_actions.py` (add)

**Interfaces:**
- Produces: `ActionContext(..., initiator: str = "user")` — `"user"` (HTTP/CLI) or `"agent"` (BumFlow tool-call).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_actions.py`:
```python
def test_action_context_initiator_defaults_to_user():
    from app.actions.base import ActionContext

    ctx = ActionContext(current_user=None, user_id="u", session_factory=None, llm=None)
    assert ctx.initiator == "user"
    assert ActionContext(None, "u", None, None, initiator="agent").initiator == "agent"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_actions.py::test_action_context_initiator_defaults_to_user -q`
Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'initiator'`

- [ ] **Step 3: Write minimal implementation**

In `app/actions/base.py`, add the field to `ActionContext` (after `llm`):
```python
    llm: "LLMClient"
    initiator: str = "user"  # "user" (HTTP /actions, CLI) | "agent" (BumFlow tool-call)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — every existing `ActionContext(...)` construction omits `initiator`, so it defaults to `"user"`)

- [ ] **Step 5: Commit**

```bash
git add app/actions/base.py tests/test_actions.py
git commit -m "feat(actions): ActionContext.initiator (user|agent) for provenance"
```

---

### Task 3: `create_task` provenance branch

**Files:**
- Modify: `app/actions/builtin.py` (add `_task_provenance` helper; update `create_task` body)
- Test: `tests/test_builtin_provenance.py` (create)

**Interfaces:**
- Consumes: `ActionContext.initiator` (Task 2).
- Produces: `_task_provenance(initiator: str) -> tuple[str, float, str]` returning `(source, confidence, status)`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_builtin_provenance.py`:
```python
"""Pure, DB-free test for create_task provenance selection (app/actions/builtin.py)."""
from app.actions.builtin import _task_provenance


def test_task_provenance_agent_proposes():
    assert _task_provenance("agent") == ("ai_inferred", 0.7, "proposed")


def test_task_provenance_user_confirms():
    assert _task_provenance("user") == ("user_explicit", 1.0, "confirmed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_builtin_provenance.py -q`
Expected: FAIL — `ImportError: cannot import name '_task_provenance'`

- [ ] **Step 3: Write minimal implementation**

In `app/actions/builtin.py`, add the helper just above the `CreateTaskIn` class:
```python
def _task_provenance(initiator: str) -> tuple[str, float, str]:
    """(source, confidence, status) for a create_task call. A model-initiated task is a
    suggestion — it lands 'proposed' for the user to confirm (Decision #8/#14). A user
    acting directly (HTTP /actions, CLI) auto-confirms."""
    if initiator == "agent":
        return ("ai_inferred", 0.7, "proposed")
    return ("user_explicit", 1.0, "confirmed")
```
Replace the `create_task` body (the docstring + embedding + INSERT). New version:
```python
async def create_task(inp: CreateTaskIn, ctx: ActionContext) -> CreateTaskOut:
    # Provenance depends on who initiated the call (Decision #8): a user acting directly
    # auto-confirms; a model-initiated task lands 'proposed' for the user to confirm.
    source, confidence, status = _task_provenance(ctx.initiator)
    embedding = await ctx.llm.embed(f"{inp.title} {inp.note or ''}".strip())
    qvec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
    async with ctx.session_factory() as s:
        row = (
            await s.execute(
                text(
                    """
                    INSERT INTO memories (user_id, type, title, note, due_at, state,
                                          source, confidence, status, confirmed_at, embedding)
                    VALUES (:uid, 'task', :title, :note, :due, 'open',
                            CAST(:source AS memory_source), :confidence,
                            CAST(:status AS memory_status),
                            CASE WHEN :status = 'confirmed' THEN now() ELSE NULL END,
                            CAST(:qvec AS vector))
                    RETURNING id, status
                    """
                ),
                {
                    "uid": ctx.user_id,
                    "title": inp.title,
                    "note": inp.note,
                    "due": inp.due_at,
                    "source": source,
                    "confidence": confidence,
                    "status": status,
                    "qvec": qvec,
                },
            )
        ).one()
        await s.commit()
    return CreateTaskOut(id=str(row.id), status=str(row.status))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — no pytest invokes the DB handler; `initiator` defaults to `"user"` so the HTTP/CLI path is unchanged. Dispatch still refuses `create_task` until Task 4, so `test_write_tool_refused_before_db` still passes.)

- [ ] **Step 5: Commit**

```bash
git add app/actions/builtin.py tests/test_builtin_provenance.py
git commit -m "feat(actions): create_task provenance by initiator (agent->proposed)"
```

---

### Task 4: Dispatch gate + no name leak

**Files:**
- Modify: `app/actions/dispatch.py` (`dispatch_tool_call`, docstring)
- Test: `tests/test_action_dispatch.py` (replace one test)

**Interfaces:**
- Consumes: `Action.agent_writable` (Task 1).
- Produces: `dispatch_tool_call` permits `read_only or agent_writable`, else raises `PermissionError("tool not permitted")` (no internal name).

- [ ] **Step 1: Update the test (RED)**

In `tests/test_action_dispatch.py`, replace `test_write_tool_refused_before_db` with:
```python
def test_non_agent_tool_refused_before_db():
    # confirm_memory is neither read_only nor agent_writable -> refused before invoke, so
    # ctx=None is never dereferenced; and the error must not leak the internal action name.
    with pytest.raises(PermissionError) as exc:
        asyncio.run(
            dispatch_tool_call(
                ToolCall("c1", "confirm_memory", {"memory_id": "00000000-0000-0000-0000-000000000000"}),
                ctx=None,
            )
        )
    assert "confirm_memory" not in str(exc.value)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_action_dispatch.py -q`
Expected: FAIL — current message is `f"non-read-only tool refused: {tc.name}"`, so `"confirm_memory"` IS in the message (assertion fails). (`confirm_memory` is already refused by the old gate, but the name-leak assertion fails.)

- [ ] **Step 3: Write minimal implementation**

In `app/actions/dispatch.py`, update the module docstring line 2 and the gate:
```python
"""Tool dispatch (Decision #21, steps 3-4): resolve a model tool call to an action and run
it. Safety lives here — tools outside the agent allowlist (read-only or agent_writable) are
refused before any handler runs. Used by /chat to build the dispatch closure.
"""
```
```python
async def dispatch_tool_call(tc: ToolCall, ctx: ActionContext) -> Any:
    act = registry.get(tc.name)                       # KeyError if unknown
    if not (act.read_only or act.agent_writable):     # curated agent-tool allowlist
        raise PermissionError("tool not permitted")   # no internal name leaked to the model
    return _to_jsonable(await act.invoke(tc.arguments, ctx))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — `confirm_memory` still refused, now without leaking its name; `create_task` is no longer refused, which is intended — it's now an agent tool that self-gates to `proposed`)

- [ ] **Step 5: Commit**

```bash
git add app/actions/dispatch.py tests/test_action_dispatch.py
git commit -m "feat(actions): dispatch gate = read_only or agent_writable; no name leak"
```

---

### Task 5: `/chat` wiring

**Files:**
- Modify: `app/main.py:68-71` (`/chat` body)

**Interfaces:**
- Consumes: `registry.agent_tool_schemas()` (Task 1), `ActionContext.initiator` (Task 2).

- [ ] **Step 1: Change the wiring**

In `app/main.py`, in the `/chat` handler, change the tools source and add `initiator="agent"`:
```python
    tools = registry.agent_tool_schemas()
    ctx = ActionContext(
        current_user=user, user_id=user_id, session_factory=SessionLocal, llm=llm,
        initiator="agent",
    )
```
(The `dispatch` closure and `handle_turn` call below are unchanged.)

- [ ] **Step 2: Verify import + suite**

Run: `/Applications/anaconda3/bin/python -c "import app.main; print('routes ok')"`
Expected: `routes ok`
Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all)

- [ ] **Step 3: Commit**

```bash
git add app/main.py
git commit -m "feat(chat): offer agent_tool_schemas() with initiator=agent"
```

---

## Final verification

- [ ] `/Applications/anaconda3/bin/python -m pytest -q` — all green (was 33; +~5 new).
- [ ] `/Applications/anaconda3/bin/python -c "import app.main; print('ok')"` — clean.
- [ ] Sanity: `registry.agent_tool_schemas()` names == {`list_projects`, `create_task`}; `confirm_memory` absent (covered by Task 1 test).

## Spec coverage map

| Spec section | Task |
|---|---|
| §1 `agent_writable` + `agent_tool_schemas()` | 1 |
| §2 `ActionContext.initiator` | 2 |
| §3 `create_task` provenance (`_task_provenance`) | 3 |
| §4 dispatch gate + name-leak fix | 4 |
| §5 `/chat` wiring (offer agent tools, initiator=agent) | 5 |
| Tests 1-5 (DB-free) | 2 (initiator), 1 (schemas/flag), 3 (provenance), 4 (refuse confirm_memory + no leak) |
