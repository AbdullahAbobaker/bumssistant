# Phase 0 — Close the Learning Loop: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-built memory system real: users can review/confirm/reject proposed memories, see and complete real tasks, keep their chat thread across reloads, and onboard with a coaching style — per [docs/ROADMAP.md](../../ROADMAP.md) Phase 0.

**Architecture:** Backend work is pure additions to the existing action registry (`@action` in new focused modules under `app/actions/`, auto-exposed on HTTP/CLI/agent/MCP) plus one new `GET /chat/history` route. Frontend work adds a single typed `api.ts` layer, binds the existing sidebar widgets to it, and fills two stub views (Review, Onboarding overlay). No new schema — every column needed (`onboarded_at`, `status='proposed'`, `state`, `message_role`) already exists.

**Tech Stack:** Python 3.12+/FastAPI/Pydantic/SQLAlchemy (raw SQL via `text()`), pytest; React 19 + TypeScript + Vite, Vitest + Testing Library.

## Global Constraints

- Every new module gets pure, DB-free unit tests; run `python -m pytest -q` (backend) and `cd frontend && npx vitest run` (frontend) before and after each task — both must stay green.
- Handlers touch the DB; everything else (registration metadata, mapping helpers, validation) must be pure and tested (CLAUDE.md reliability bar).
- Nothing imports Langdock except `app/llm.py`; all LLM use goes through `ctx.llm` / `get_llm()`.
- AI-initiated writes land as `status='proposed'` (Decision #8); user-only actions must have `read_only=False, agent_writable=False` so `is_agent_tool()` refuses them.
- All UI copy and action descriptions in German (Decision #15).
- Follow existing SQL discipline: session-per-call from `ctx.session_factory`, owner-scoping (`user_id = :uid`) in every WHERE clause, enum casts via `CAST(:x AS enum_name)`.
- Commit after every task with the repo's conventional style (`feat:`, `feat(ui):`, `test:`).

**Local environment note (this laptop):** port 8000 is occupied by another project and host :5432 shadows the Docker Postgres. Run the backend as `uvicorn app.main:app --reload --port 8001` with Docker Postgres on 5433, and for manual browser testing temporarily point the `vite.config.ts` proxy targets at `http://localhost:8001` (do **not** commit that change). Unit tests need neither server.

---

### Task 1: Memory review actions — `list_proposed_memories` + `reject_memory`

**Files:**
- Create: `app/actions/memory_review.py`
- Modify: `app/actions/__init__.py` (register the new module)
- Test: `tests/test_memory_review_actions.py`

**Interfaces:**
- Consumes: `app.actions.base.action`, `ActionContext`; `NoArgs` from `app.actions.builtin`; `memories` table.
- Produces: action `list_proposed_memories` (read_only) returning `list[ProposedMemoryOut]` with fields `id, type, title, note, confidence, source, created_at`; action `reject_memory` (user-only write) taking `{memory_id: UUID}` and returning `{id, status, changed}`. Task 5's frontend API and Task 8's Review panel call these via `POST /actions/{name}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_memory_review_actions.py`:

```python
"""Pure, DB-free tests for the memory-review actions (roadmap F0.1).

Handlers hit the DB (exercised via the running app); here we lock registration
metadata, agent exposure, and schema validation — the safety-relevant parts.
"""
import pytest
from pydantic import ValidationError

from app.actions import registry
from app.actions.base import is_agent_tool


def test_list_proposed_memories_registered_read_only():
    a = registry.get("list_proposed_memories")
    assert a.read_only is True
    assert a.http_method == "GET"


def test_reject_memory_registered_as_user_only_write():
    a = registry.get("reject_memory")
    assert a.read_only is False
    assert a.agent_writable is False
    # the single safety predicate: never offered to / dispatchable by the model
    assert is_agent_tool(a) is False


def test_reject_memory_requires_a_valid_uuid():
    a = registry.get("reject_memory")
    with pytest.raises(ValidationError):
        a.input_model.model_validate({})
    with pytest.raises(ValidationError):
        a.input_model.model_validate({"memory_id": "not-a-uuid"})


def test_agent_tools_include_list_but_never_reject():
    names = {t["function"]["name"] for t in registry.agent_tool_schemas()}
    assert "list_proposed_memories" in names
    assert "reject_memory" not in names
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_memory_review_actions.py -v`
Expected: FAIL with `KeyError: "unknown action: 'list_proposed_memories'"`

- [ ] **Step 3: Write the implementation**

Create `app/actions/memory_review.py`:

```python
"""Memory review actions (roadmap F0.1) — the user-facing side of the
propose-then-confirm gate (Decision #8): list what BumFlow proposed, reject
what's wrong. The accept side (`confirm_memory`) lives in builtin.py.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import text

from app.actions.base import ActionContext, action
from app.actions.builtin import NoArgs


class ProposedMemoryOut(BaseModel):
    id: str
    type: str
    title: str
    note: str | None
    confidence: float
    source: str
    created_at: datetime


@action(
    name="list_proposed_memories",
    description="Liste die vorgeschlagenen, noch unbestätigten Erinnerungen der Person auf.",
    read_only=True,
)
async def list_proposed_memories(inp: NoArgs, ctx: ActionContext) -> list[ProposedMemoryOut]:
    async with ctx.session_factory() as s:
        rows = (
            await s.execute(
                text(
                    """
                    SELECT id, type, title, note, confidence, source, created_at
                    FROM memories
                    WHERE user_id = :uid AND status = 'proposed'
                    ORDER BY created_at DESC
                    LIMIT 50
                    """
                ),
                {"uid": ctx.user_id},
            )
        ).all()
    return [
        ProposedMemoryOut(
            id=str(r.id),
            type=str(r.type),
            title=r.title,
            note=r.note,
            confidence=float(r.confidence),
            source=str(r.source),
            created_at=r.created_at,
        )
        for r in rows
    ]


class RejectMemoryIn(BaseModel):
    memory_id: UUID = Field(..., description="ID der vorgeschlagenen Erinnerung")


class RejectMemoryOut(BaseModel):
    id: str
    status: str
    changed: bool


@action(
    name="reject_memory",
    description="Lehne eine vorgeschlagene Erinnerung ab (proposed → rejected).",
    read_only=False,
)
async def reject_memory(inp: RejectMemoryIn, ctx: ActionContext) -> RejectMemoryOut:
    # Mirror of confirm_memory (Decision #8): owner-scoped, only flips 'proposed'.
    async with ctx.session_factory() as s:
        row = (
            await s.execute(
                text(
                    """
                    UPDATE memories
                    SET status = 'rejected', updated_at = now()
                    WHERE id = CAST(:mid AS uuid) AND user_id = :uid AND status = 'proposed'
                    RETURNING id, status
                    """
                ),
                {"mid": str(inp.memory_id), "uid": ctx.user_id},
            )
        ).first()
        await s.commit()
    if row is None:  # not found, not owned, or not currently 'proposed'
        return RejectMemoryOut(id=str(inp.memory_id), status="unchanged", changed=False)
    return RejectMemoryOut(id=str(row.id), status=str(row.status), changed=True)
```

Modify `app/actions/__init__.py` — replace the builtin import line block:

```python
from app.actions.base import Action, ActionContext, Registry, action, registry
from app.actions import builtin as _builtin  # noqa: F401  registers built-in actions
from app.actions import memory_review as _memory_review  # noqa: F401  registers review actions

__all__ = ["Action", "ActionContext", "Registry", "action", "registry"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_memory_review_actions.py -v`
Expected: 4 PASSED

- [ ] **Step 5: Run the full backend suite**

Run: `python -m pytest -q`
Expected: all tests pass (no regressions — existing `test_actions.py` counts registry contents loosely with `<=`, so new actions don't break it)

- [ ] **Step 6: Commit**

```bash
git add app/actions/memory_review.py app/actions/__init__.py tests/test_memory_review_actions.py
git commit -m "feat(actions): list_proposed_memories + reject_memory (review loop, F0.1)"
```

---

### Task 2: Task actions — `list_tasks` + `complete_task`

**Files:**
- Create: `app/actions/tasks.py`
- Modify: `app/actions/__init__.py`
- Test: `tests/test_task_actions.py`

**Interfaces:**
- Consumes: same primitives as Task 1.
- Produces: action `list_tasks` (read_only, agent-offered) returning `list[TaskOut]` with `id, title, note, due_at, state, overdue`; action `complete_task` (agent_writable) taking `{task_id: UUID}` returning `{id, state, changed}`; pure helper `completion_stamp(initiator: str) -> str`. Task 5/6 call these from the frontend; BumFlow gets both as tools.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_task_actions.py`:

```python
"""Pure, DB-free tests for the task actions (roadmap F0.2)."""
import pytest
from pydantic import ValidationError

from app.actions import registry
from app.actions.tasks import completion_stamp


def test_completion_stamp_fails_closed():
    # only a direct user counts as 'user'; anything else (agent, typo, future value)
    # is stamped 'agent' — same fail-closed shape as _task_provenance
    assert completion_stamp("user") == "user"
    assert completion_stamp("agent") == "agent"
    assert completion_stamp("mcp") == "agent"
    assert completion_stamp("") == "agent"


def test_list_tasks_registered_read_only():
    a = registry.get("list_tasks")
    assert a.read_only is True
    assert a.http_method == "GET"


def test_complete_task_registered_agent_writable():
    a = registry.get("complete_task")
    assert a.read_only is False
    assert a.agent_writable is True  # BumFlow may mark done on explicit user say-so


def test_complete_task_requires_a_valid_uuid():
    a = registry.get("complete_task")
    with pytest.raises(ValidationError):
        a.input_model.model_validate({})
    with pytest.raises(ValidationError):
        a.input_model.model_validate({"task_id": "nope"})


def test_agent_tools_include_both_task_actions():
    names = {t["function"]["name"] for t in registry.agent_tool_schemas()}
    assert {"list_tasks", "complete_task"} <= names
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_task_actions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.actions.tasks'`

- [ ] **Step 3: Write the implementation**

Create `app/actions/tasks.py`:

```python
"""Task actions (roadmap F0.2): list open tasks, mark one done.

Tasks are 'task'-type memories (Decision #7); completion flips the promoted
`state` column and stamps who completed it into `details` (audit, Decision #8).
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import text

from app.actions.base import ActionContext, action
from app.actions.builtin import NoArgs


def completion_stamp(initiator: str) -> str:
    """Provenance value for details->>'completed_by'. Fail-closed like
    _task_provenance: anything that isn't a direct user is stamped 'agent'."""
    return "user" if initiator == "user" else "agent"


class TaskOut(BaseModel):
    id: str
    title: str
    note: str | None
    due_at: datetime | None
    state: str | None
    overdue: bool


@action(
    name="list_tasks",
    description="Liste die offenen Aufgaben der Person auf, überfällige zuerst.",
    read_only=True,
)
async def list_tasks(inp: NoArgs, ctx: ActionContext) -> list[TaskOut]:
    async with ctx.session_factory() as s:
        rows = (
            await s.execute(
                text(
                    """
                    SELECT id, title, note, due_at, state,
                           (due_at IS NOT NULL AND due_at <= now()) AS overdue
                    FROM memories
                    WHERE user_id = :uid AND type = 'task' AND status = 'confirmed'
                      AND (state IS NULL OR state <> 'done')
                    ORDER BY (due_at IS NULL) ASC, due_at ASC, created_at DESC
                    LIMIT 20
                    """
                ),
                {"uid": ctx.user_id},
            )
        ).all()
    return [
        TaskOut(
            id=str(r.id), title=r.title, note=r.note, due_at=r.due_at,
            state=r.state, overdue=bool(r.overdue),
        )
        for r in rows
    ]


class CompleteTaskIn(BaseModel):
    task_id: UUID = Field(..., description="ID der Aufgabe")


class CompleteTaskOut(BaseModel):
    id: str
    state: str
    changed: bool


@action(
    name="complete_task",
    description="Markiere eine Aufgabe der Person als erledigt.",
    read_only=False,
    agent_writable=True,  # BumFlow may mark done when the user says so in chat
)
async def complete_task(inp: CompleteTaskIn, ctx: ActionContext) -> CompleteTaskOut:
    stamp = completion_stamp(ctx.initiator)
    async with ctx.session_factory() as s:
        row = (
            await s.execute(
                text(
                    """
                    UPDATE memories
                    SET state = 'done', updated_at = now(),
                        details = details || jsonb_build_object('completed_by', CAST(:stamp AS text))
                    WHERE id = CAST(:tid AS uuid) AND user_id = :uid AND type = 'task'
                      AND status = 'confirmed' AND (state IS NULL OR state <> 'done')
                    RETURNING id, state
                    """
                ),
                {"tid": str(inp.task_id), "uid": ctx.user_id, "stamp": stamp},
            )
        ).first()
        await s.commit()
    if row is None:  # not found, not owned, not a confirmed task, or already done
        return CompleteTaskOut(id=str(inp.task_id), state="unchanged", changed=False)
    return CompleteTaskOut(id=str(row.id), state=str(row.state), changed=True)
```

Modify `app/actions/__init__.py` — add after the memory_review import:

```python
from app.actions import tasks as _tasks  # noqa: F401  registers task actions
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_task_actions.py -v`
Expected: 5 PASSED

- [ ] **Step 5: Run the full backend suite**

Run: `python -m pytest -q`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add app/actions/tasks.py app/actions/__init__.py tests/test_task_actions.py
git commit -m "feat(actions): list_tasks + complete_task with completion provenance (F0.2)"
```

---

### Task 3: Persistent chat history — `GET /chat/history`

**Files:**
- Modify: `app/chat/repository.py` (add `rows_to_history` + `fetch_history` at module level, after `get_or_create_user`)
- Modify: `app/main.py` (new route + models)
- Test: `tests/test_history.py`

**Interfaces:**
- Consumes: `messages` table (`user_id` is denormalized onto messages, so no join needed).
- Produces: `rows_to_history(rows_newest_first) -> list[dict]` (pure); `fetch_history(session_factory, user_id, limit=50) -> list[dict]`; `GET /chat/history?limit=N` returning `{"messages": [{role, content, created_at}]}` oldest-first. Task 7's frontend calls this.

- [ ] **Step 1: Write the failing test**

Create `tests/test_history.py`:

```python
"""Pure test for the history payload mapping (roadmap F0.3)."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.chat.repository import rows_to_history


def _row(role: str, content: str, minute: int) -> SimpleNamespace:
    return SimpleNamespace(
        role=role, content=content,
        created_at=datetime(2026, 7, 6, 9, minute, tzinfo=timezone.utc),
    )


def test_rows_to_history_reverses_to_chronological_and_serializes():
    newest_first = [_row("assistant", "b", 5), _row("user", "a", 4)]
    out = rows_to_history(newest_first)
    assert [m["content"] for m in out] == ["a", "b"]          # oldest first
    assert out[0]["role"] == "user"
    assert out[0]["created_at"] == "2026-07-06T09:04:00+00:00"  # ISO 8601


def test_rows_to_history_empty():
    assert rows_to_history([]) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_history.py -v`
Expected: FAIL with `ImportError: cannot import name 'rows_to_history'`

- [ ] **Step 3: Write the implementation**

In `app/chat/repository.py`, add to the pure-helpers section (after `row_to_candidate`):

```python
def rows_to_history(rows_newest_first: Sequence[Any]) -> list[dict]:
    """Map newest-first message rows onto a chronological, JSON-able history payload."""
    rows = list(rows_newest_first)
    rows.reverse()
    return [
        {"role": str(r.role), "content": r.content, "created_at": r.created_at.isoformat()}
        for r in rows
    ]
```

Add after `get_or_create_user`:

```python
async def fetch_history(
    session_factory: Callable[[], AsyncSession], user_id: str, limit: int = 50
) -> list[dict]:
    """The tail of the user's single persistent thread (Decision #17), oldest first —
    so a page reload doesn't lose the conversation."""
    async with session_factory() as s:
        rows = (
            await s.execute(
                text(
                    """
                    SELECT role, content, created_at FROM messages
                    WHERE user_id = :uid
                    ORDER BY created_at DESC
                    LIMIT :lim
                    """
                ),
                {"uid": user_id, "lim": limit},
            )
        ).all()
    return rows_to_history(rows)
```

In `app/main.py`: extend the repository import to
`from app.chat.repository import DbChatPort, fetch_history, get_or_create_user`,
then add after the `/chat` route:

```python
class HistoryMessage(BaseModel):
    role: str
    content: str
    created_at: str


class HistoryResponse(BaseModel):
    messages: list[HistoryMessage]


@app.get("/chat/history", response_model=HistoryResponse)
async def chat_history(
    limit: int = 50,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> HistoryResponse:
    """The persistent thread, oldest first — the frontend hydrates from this on load."""
    user_id = await get_or_create_user(session, user)
    msgs = await fetch_history(SessionLocal, user_id, limit=min(max(limit, 1), 200))
    return HistoryResponse(messages=[HistoryMessage(**m) for m in msgs])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_history.py -v` then `python -m pytest -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add app/chat/repository.py app/main.py tests/test_history.py
git commit -m "feat(chat): GET /chat/history — thread survives reloads (F0.3)"
```

---

### Task 4: Onboarding backend — apply answers + `/me` onboarded flag

**Files:**
- Modify: `app/onboarding/questions.py` (add `MemoryWrite`, `validate_answers`, `answers_to_writes`)
- Create: `app/actions/onboarding.py`
- Modify: `app/actions/__init__.py`, `app/main.py` (`/me`)
- Test: `tests/test_onboarding_apply.py`

**Interfaces:**
- Consumes: `COLD_QUESTIONS`, `COACHING_STYLES`, `required_keys()` from `app/onboarding/questions.py`; `users.onboarded_at`; `memories`.
- Produces: pure `validate_answers(answers: dict[str, str]) -> list[str]` and `answers_to_writes(answers) -> list[MemoryWrite]` where `MemoryWrite(type: str, title: str, detail_kind: str | None)`; action `get_onboarding_questions` (read_only) returning `list[QuestionOut]`; action `complete_onboarding` (user-only) taking `{answers: dict[str, str]}` returning `{ok: bool, errors: list[str]}`; `GET /me` gains `"onboarded": bool`. Task 9's dialog consumes all three.

Note: the coaching answer is written as a **confirmed `comm_style` memory whose `title` is the style string** — exactly what `DbChatPort.load_context` already reads (`SELECT title FROM memories WHERE type = 'comm_style' AND status = 'confirmed'`), so the chosen tone takes effect on the very next turn with zero orchestrator changes.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_onboarding_apply.py`:

```python
"""Pure tests for onboarding answer validation + answer→memory mapping (F0.4)."""
from app.actions import registry
from app.actions.base import is_agent_tool
from app.onboarding.questions import answers_to_writes, validate_answers


def test_validate_requires_coaching_style():
    assert validate_answers({}) == ["Pflichtfrage fehlt: coaching_style"]
    assert validate_answers({"coaching_style": "   "}) == ["Pflichtfrage fehlt: coaching_style"]


def test_validate_rejects_unknown_style():
    errors = validate_answers({"coaching_style": "Brutal ehrlich"})
    assert any("Unbekannter Coaching-Stil" in e for e in errors)


def test_validate_ok_with_only_the_mandatory_answer():
    assert validate_answers({"coaching_style": "Ausgewogen"}) == []


def test_answers_map_to_typed_memory_writes():
    writes = answers_to_writes(
        {
            "coaching_style": "Ausgewogen",
            "goals": "Q3-Launch schaffen",
            "stress_triggers": "Unklare Anforderungen",
        }
    )
    by_kind = {(w.type, w.detail_kind): w.title for w in writes}
    assert by_kind[("comm_style", "coaching_style")] == "Ausgewogen"
    assert by_kind[("pattern", "goal")] == "Q3-Launch schaffen"
    assert by_kind[("pattern", "stress_trigger")] == "Unklare Anforderungen"


def test_skipped_and_blank_optionals_produce_no_writes():
    writes = answers_to_writes({"coaching_style": "Ausgewogen", "goals": "  "})
    assert len(writes) == 1
    assert writes[0].type == "comm_style"


def test_onboarding_actions_registered_with_safe_flags():
    q = registry.get("get_onboarding_questions")
    assert q.read_only is True
    c = registry.get("complete_onboarding")
    assert c.read_only is False and c.agent_writable is False
    assert is_agent_tool(c) is False  # the model can never complete onboarding
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_onboarding_apply.py -v`
Expected: FAIL with `ImportError: cannot import name 'answers_to_writes'`

- [ ] **Step 3: Add the pure functions**

Append to `app/onboarding/questions.py`:

```python
@dataclass(frozen=True)
class MemoryWrite:
    """One memory row an onboarding answer becomes (parsed from the question's target)."""

    type: str                 # memory_type enum value
    title: str
    detail_kind: str | None   # details->'kind' (e.g. 'goal', 'stress_trigger')


def validate_answers(answers: dict[str, str]) -> list[str]:
    """Human-readable validation errors; empty list = safe to apply."""
    errors = [
        f"Pflichtfrage fehlt: {k}"
        for k in required_keys()
        if not (answers.get(k) or "").strip()
    ]
    style = (answers.get("coaching_style") or "").strip()
    if style and style not in COACHING_STYLES:
        errors.append(f"Unbekannter Coaching-Stil: {style}")
    return errors


def answers_to_writes(answers: dict[str, str]) -> list[MemoryWrite]:
    """Map non-empty answers onto memory writes via each question's target
    ('type' or 'type:kind'). Skipped/blank optional questions produce nothing."""
    writes: list[MemoryWrite] = []
    for q in COLD_QUESTIONS:
        val = (answers.get(q.key) or "").strip()
        if not val:
            continue
        mtype, _, kind = q.target.partition(":")
        writes.append(MemoryWrite(type=mtype, title=val, detail_kind=kind or None))
    return writes
```

- [ ] **Step 4: Write the actions**

Create `app/actions/onboarding.py`:

```python
"""Onboarding actions (roadmap F0.4, Decision #13): serve the cold questions and
apply the answers. coaching_style becomes a confirmed comm_style memory that
calibrates BumFlow's tone from the next turn (Decision #14)."""
from __future__ import annotations

import json

from pydantic import BaseModel, Field
from sqlalchemy import text

from app.actions.base import ActionContext, action
from app.actions.builtin import NoArgs
from app.onboarding.questions import COLD_QUESTIONS, answers_to_writes, validate_answers


class QuestionOut(BaseModel):
    key: str
    prompt: str
    kind: str
    required: bool
    options: list[str]
    help_text: str


@action(
    name="get_onboarding_questions",
    description="Liefere die Onboarding-Fragen (Coaching-Stil, Ziele, Stressauslöser).",
    read_only=True,
)
async def get_onboarding_questions(inp: NoArgs, ctx: ActionContext) -> list[QuestionOut]:
    return [
        QuestionOut(
            key=q.key, prompt=q.prompt, kind=q.kind, required=q.required,
            options=list(q.options), help_text=q.help_text,
        )
        for q in COLD_QUESTIONS
    ]


class CompleteOnboardingIn(BaseModel):
    answers: dict[str, str] = Field(..., description="Antworten je Frage-Key")


class CompleteOnboardingOut(BaseModel):
    ok: bool
    errors: list[str]


@action(
    name="complete_onboarding",
    description="Schließe das Onboarding ab und speichere die Antworten.",
    read_only=False,  # user-only: never an agent tool
)
async def complete_onboarding(
    inp: CompleteOnboardingIn, ctx: ActionContext
) -> CompleteOnboardingOut:
    errors = validate_answers(inp.answers)
    if errors:
        return CompleteOnboardingOut(ok=False, errors=errors)
    async with ctx.session_factory() as s:
        for w in answers_to_writes(inp.answers):
            embedding = await ctx.llm.embed(w.title)
            qvec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
            details = json.dumps({"kind": w.detail_kind} if w.detail_kind else {})
            await s.execute(
                text(
                    """
                    INSERT INTO memories (user_id, type, title, details, source,
                                          confidence, status, confirmed_at, embedding)
                    VALUES (:uid, CAST(:type AS memory_type), :title,
                            CAST(:details AS jsonb), 'user_explicit', 1.0,
                            'confirmed', now(), CAST(:qvec AS vector))
                    """
                ),
                {"uid": ctx.user_id, "type": w.type, "title": w.title,
                 "details": details, "qvec": qvec},
            )
        await s.execute(
            text(
                "UPDATE users SET onboarded_at = now() "
                "WHERE id = :uid AND onboarded_at IS NULL"
            ),
            {"uid": ctx.user_id},
        )
        await s.commit()
    return CompleteOnboardingOut(ok=True, errors=[])
```

Modify `app/actions/__init__.py` — add:

```python
from app.actions import onboarding as _onboarding  # noqa: F401  registers onboarding actions
```

Modify `app/main.py` — replace the `/me` route with:

```python
@app.get("/me")
async def me(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Who am I? Confirms auth (real or dev-bypass), safety mode, and onboarding state."""
    user_id = await get_or_create_user(session, user)
    row = (
        await session.execute(
            text("SELECT onboarded_at FROM users WHERE id = :uid"), {"uid": user_id}
        )
    ).one()
    return {
        "email": user.email,
        "display_name": user.display_name,
        "environment": settings.environment,
        "warm_start_scan_mode": settings.effective_scan_mode,
        "onboarded": row.onboarded_at is not None,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_onboarding_apply.py -v` then `python -m pytest -q`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/questions.py app/actions/onboarding.py app/actions/__init__.py app/main.py tests/test_onboarding_apply.py
git commit -m "feat(onboarding): questions + complete_onboarding actions, /me onboarded flag (F0.4)"
```

---

### Task 5: Frontend API layer — `src/api.ts`

**Files:**
- Create: `frontend/src/api.ts`
- Test: `frontend/src/api.test.ts`

**Interfaces:**
- Consumes: backend routes from Tasks 1–4. All actions go through `POST /actions/{name}` — the HTTP adapter has one dispatcher; the catalog's `GET` method label is informational only.
- Produces: types `Me, Task, ProposedMemory, HistoryMessage, OnboardingQuestion` and functions `getMe, getHistory, invokeAction, listTasks, completeTask, listProposedMemories, confirmMemory, rejectMemory, getOnboardingQuestions, completeOnboarding` — the ONLY fetch layer Tasks 6–9 use.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/api.test.ts`:

```typescript
import { afterEach, expect, test, vi } from 'vitest'
import { completeTask, getMe, invokeAction } from './api'

afterEach(() => vi.unstubAllGlobals())

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('invokeAction POSTs JSON to /actions/{name}', async () => {
  const fetchMock = vi.fn().mockResolvedValue(okResponse([{ id: '1' }]))
  vi.stubGlobal('fetch', fetchMock)
  const result = await invokeAction<{ id: string }[]>('list_tasks')
  expect(fetchMock).toHaveBeenCalledWith('/actions/list_tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  expect(result).toEqual([{ id: '1' }])
})

test('completeTask sends the task_id payload', async () => {
  const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: 'x', state: 'done', changed: true }))
  vi.stubGlobal('fetch', fetchMock)
  await completeTask('abc-123')
  expect(fetchMock).toHaveBeenCalledWith('/actions/complete_task', expect.objectContaining({
    body: JSON.stringify({ task_id: 'abc-123' }),
  }))
})

test('errors surface the backend detail message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: 'unknown action: nope' }), { status: 404 }),
  ))
  await expect(getMe()).rejects.toThrow('unknown action: nope')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api.test.ts`
Expected: FAIL — `Cannot find module './api'`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/api.ts`:

```typescript
// frontend/src/api.ts — the one thin, typed layer over the backend. Every
// component fetches through here so URL/error handling lives in ONE place.

export interface Me {
  email: string
  display_name: string
  environment: string
  warm_start_scan_mode: string
  onboarded: boolean
}

export interface Task {
  id: string
  title: string
  note: string | null
  due_at: string | null
  state: string | null
  overdue: boolean
}

export interface ProposedMemory {
  id: string
  type: string
  title: string
  note: string | null
  confidence: number
  source: string
  created_at: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant' | 'briefing'
  content: string
  created_at: string
}

export interface OnboardingQuestion {
  key: string
  prompt: string
  kind: 'choice' | 'text'
  required: boolean
  options: string[]
  help_text: string
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function getMe(): Promise<Me> {
  return asJson<Me>(await fetch('/me'))
}

export async function getHistory(): Promise<HistoryMessage[]> {
  const data = await asJson<{ messages: HistoryMessage[] }>(await fetch('/chat/history'))
  return data.messages
}

// Every action goes through the registry's single dispatcher: POST /actions/{name}.
export async function invokeAction<T>(name: string, payload: object = {}): Promise<T> {
  return asJson<T>(await fetch(`/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))
}

export const listTasks = () => invokeAction<Task[]>('list_tasks')

export const completeTask = (taskId: string) =>
  invokeAction<{ id: string; state: string; changed: boolean }>('complete_task', { task_id: taskId })

export const listProposedMemories = () => invokeAction<ProposedMemory[]>('list_proposed_memories')

export const confirmMemory = (memoryId: string) =>
  invokeAction<{ id: string; status: string; changed: boolean }>('confirm_memory', { memory_id: memoryId })

export const rejectMemory = (memoryId: string) =>
  invokeAction<{ id: string; status: string; changed: boolean }>('reject_memory', { memory_id: memoryId })

export const getOnboardingQuestions = () =>
  invokeAction<OnboardingQuestion[]>('get_onboarding_questions')

export const completeOnboarding = (answers: Record<string, string>) =>
  invokeAction<{ ok: boolean; errors: string[] }>('complete_onboarding', { answers })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/api.test.ts`
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat(ui): typed api layer for actions, /me and /chat/history"
```

---

### Task 6: Live sidebar — ProfileCard, TaskWidget, real proposed count

**Files:**
- Modify: `frontend/src/components/widgets/ProfileCard.tsx`, `frontend/src/components/widgets/TaskWidget.tsx`, `frontend/src/components/ChatView.tsx`
- Test: rewrite `frontend/src/components/widgets/ProfileCard.test.tsx`, `frontend/src/components/widgets/TaskWidget.test.tsx`; update `frontend/src/components/ChatView.test.tsx`

**Interfaces:**
- Consumes: `getMe, listTasks, completeTask, listProposedMemories` from `../../api` (Task 5); `Task` type.
- Produces: `TaskWidget` no longer takes props (drop `TaskWidgetProps`/`TaskItem` exports); `ChatView` fetches the proposed count itself and hides the teaser at 0. Nothing else consumes these — leaf components.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/components/widgets/ProfileCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ProfileCard } from './ProfileCard'

vi.mock('../../api', () => ({
  getMe: vi.fn().mockResolvedValue({
    email: 'aa@bumg.de', display_name: 'Abdullah Abobaker',
    environment: 'development', warm_start_scan_mode: 'mock', onboarded: true,
  }),
}))

test('shows the real display name from /me', async () => {
  render(<ProfileCard />)
  expect(await screen.findByText('Abdullah Abobaker')).toBeInTheDocument()
  expect(screen.getByText('A')).toBeInTheDocument() // avatar initial
})
```

Replace `frontend/src/components/widgets/TaskWidget.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { TaskWidget } from './TaskWidget'
import * as api from '../../api'

vi.mock('../../api', () => ({
  listTasks: vi.fn(),
  completeTask: vi.fn().mockResolvedValue({ id: 't1', state: 'done', changed: true }),
}))

const TASK = {
  id: 't1', title: 'Review schreiben', note: null,
  due_at: '2026-07-06T09:00:00+00:00', state: 'open', overdue: true,
}

beforeEach(() => {
  vi.mocked(api.listTasks).mockReset().mockResolvedValue([TASK])
  vi.mocked(api.completeTask).mockClear()
})

test('renders tasks from the backend', async () => {
  render(<TaskWidget />)
  expect(await screen.findByText('Review schreiben')).toBeInTheDocument()
})

test('checkbox completes the task and removes it optimistically', async () => {
  render(<TaskWidget />)
  await screen.findByText('Review schreiben')
  vi.mocked(api.listTasks).mockResolvedValue([]) // refetch after completion
  fireEvent.click(screen.getByRole('checkbox', { name: 'Review schreiben erledigen' }))
  await waitFor(() => expect(api.completeTask).toHaveBeenCalledWith('t1'))
  expect(screen.queryByText('Review schreiben')).not.toBeInTheDocument()
})

test('shows the empty state when there are no open tasks', async () => {
  vi.mocked(api.listTasks).mockResolvedValue([])
  render(<TaskWidget />)
  expect(await screen.findByText('Keine offenen Aufgaben.')).toBeInTheDocument()
})
```

In `frontend/src/components/ChatView.test.tsx`, add the api mock at the top (after imports) so the view renders, and add one test:

```tsx
vi.mock('../api', () => ({
  getMe: vi.fn().mockResolvedValue({
    email: 'a@b.c', display_name: 'A', environment: 'development',
    warm_start_scan_mode: 'mock', onboarded: true,
  }),
  listTasks: vi.fn().mockResolvedValue([]),
  completeTask: vi.fn(),
  listProposedMemories: vi.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]),
  getHistory: vi.fn().mockResolvedValue([]),
}))

test('teaser shows the real proposed-memory count', async () => {
  render(<ChatView onReviewClick={() => {}} />)
  expect(await screen.findByText('3 Vorschläge zur Bestätigung')).toBeInTheDocument()
})
```

(Existing ChatView tests keep working because the mock resolves empty lists; if any existing assertion references the hardcoded count of 2, update it to use the mock above. The mock path is `'../api'` here because ChatView sits one level below `src/`; widget tests use `'../../api'`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components`
Expected: FAIL — ProfileCard still shows "Abdullah" hardcoded, TaskWidget still uses mock tasks

- [ ] **Step 3: Implement ProfileCard**

Replace `frontend/src/components/widgets/ProfileCard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import './ProfileCard.css'
import { getMe } from '../../api'

export function ProfileCard() {
  const [name, setName] = useState('')

  useEffect(() => {
    let cancelled = false
    getMe()
      .then(me => { if (!cancelled) setName(me.display_name) })
      .catch(() => { /* sidebar stays quiet on error */ })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="profile-card glass">
      <div className="profile-avatar-large">{name ? name[0].toUpperCase() : '·'}</div>
      <div className="profile-info">
        <div className="profile-name">{name || '…'}</div>
        <div className="profile-role">Nutzerprofil</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement TaskWidget**

Replace `frontend/src/components/widgets/TaskWidget.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import './TaskWidget.css'
import { completeTask, listTasks } from '../../api'
import type { Task } from '../../api'

export function TaskWidget() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    listTasks()
      .then(ts => { setTasks(ts); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const onComplete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id)) // optimistic
    try { await completeTask(id) } finally { refresh() }
  }

  return (
    <div className="widget glass-dark task-widget-card">
      <h3 className="text-heading-medium">Aufgaben</h3>
      {loaded && tasks.length === 0 ? (
        <p className="task-empty">Keine offenen Aufgaben.</p>
      ) : (
        <ul className="task-list">
          {tasks.map(task => (
            <li key={task.id} className={`task-item ${task.overdue ? 'overdue' : ''}`}>
              <input
                type="checkbox"
                className="task-checkbox-input"
                checked={false}
                onChange={() => onComplete(task.id)}
                aria-label={`${task.title} erledigen`}
              />
              <span className="task-title">{task.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Append to `frontend/src/components/widgets/TaskWidget.css`:

```css
.task-empty {
  color: var(--fg-muted);
  font-size: 0.875rem;
}

.task-item.overdue .task-title {
  color: var(--fg);
  font-weight: 600;
}
```

- [ ] **Step 5: Implement the real count in ChatView**

Replace `frontend/src/components/ChatView.tsx`:

```tsx
// frontend/src/components/ChatView.tsx
import { useEffect, useState } from 'react'
import './ChatView.css'
import { listProposedMemories } from '../api'
import { ChatWidget } from './widgets/ChatWidget'
import { ProfileCard } from './widgets/ProfileCard'
import { TaskWidget } from './widgets/TaskWidget'
import { ProposedMemoriesTeaser } from './widgets/ProposedMemoriesTeaser'

export function germanGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Guten Morgen'
  if (hour >= 12 && hour < 18) return 'Guten Tag'
  if (hour >= 18 && hour < 23) return 'Guten Abend'
  return 'Gute Nacht'
}

export interface ChatViewProps {
  onReviewClick: () => void
}

export function ChatView({ onReviewClick }: ChatViewProps) {
  const greeting = germanGreeting(new Date().getHours())
  const [proposedCount, setProposedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    listProposedMemories()
      .then(ms => { if (!cancelled) setProposedCount(ms.length) })
      .catch(() => { /* teaser simply stays hidden */ })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="chat-view">
      <div className="chat-view-hero">
        <ChatWidget />
      </div>
      <aside className="chat-view-sidebar" aria-label="Übersicht">
        <h2 className="chat-view-greeting">{greeting}</h2>
        <ProfileCard />
        <TaskWidget />
        {proposedCount > 0 && (
          <ProposedMemoriesTeaser count={proposedCount} onReview={onReviewClick} />
        )}
      </aside>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: all pass (fix any pre-existing ChatView test that asserted the hardcoded count)

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(ui): sidebar binds to real data — profile, tasks, proposed count (F0.2)"
```

---

### Task 7: Chat history hydration + briefing rendering

**Files:**
- Modify: `frontend/src/components/widgets/ChatWidget.tsx`, `frontend/src/App.css` (briefing style)
- Test: `frontend/src/components/widgets/ChatWidget.test.tsx` (extend)

**Interfaces:**
- Consumes: `getHistory` from `../../api` (Task 5).
- Produces: `Message.role` widens to `'user' | 'assistant' | 'briefing'`; thread hydrates on mount. Leaf component — nothing downstream.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/components/widgets/ChatWidget.test.tsx` (add the api mock at the top if the file doesn't already mock `../../api`; keep any existing mocks/tests intact):

```tsx
vi.mock('../../api', () => ({
  getHistory: vi.fn().mockResolvedValue([
    { role: 'briefing', content: 'Guten Morgen! 2 Aufgaben heute.', created_at: '2026-07-06T07:00:00+00:00' },
    { role: 'user', content: 'Danke!', created_at: '2026-07-06T07:01:00+00:00' },
    { role: 'assistant', content: 'Gern!', created_at: '2026-07-06T07:01:05+00:00' },
  ]),
}))

test('hydrates the thread from /chat/history on mount', async () => {
  render(<ChatWidget />)
  expect(await screen.findByText('Danke!')).toBeInTheDocument()
  expect(screen.getByText('Gern!')).toBeInTheDocument()
})

test('briefing messages render with the briefing style', async () => {
  render(<ChatWidget />)
  const briefing = await screen.findByText('Guten Morgen! 2 Aufgaben heute.')
  expect(briefing.closest('.message')).toHaveClass('briefing')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/widgets/ChatWidget.test.tsx`
Expected: FAIL — history never fetched, thread starts empty

- [ ] **Step 3: Implement**

In `frontend/src/components/widgets/ChatWidget.tsx`:

Add the import:

```tsx
import { getHistory } from '../../api'
```

Widen the `Message` type:

```tsx
interface Message {
  id: string
  role: 'user' | 'assistant' | 'briefing'
  content: string
  timestamp: Date
}
```

Update `MessageBubble` so briefings render on the assistant side with an extra class:

```tsx
function MessageBubble({ msg }: MessageBubbleProps) {
  const side = msg.role === 'user' ? 'user' : 'assistant'
  const extra = msg.role === 'briefing' ? ' briefing' : ''
  return (
    <div className={`message ${side}${extra}`}>
      <div className="message-avatar">{msg.role === 'user' ? 'Du' : 'BF'}</div>
      <div>
        <div className="message-bubble">{msg.content}</div>
        <div className="message-time">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}
```

Inside `ChatWidget`, add a hydration effect (place it before the auto-scroll effect):

```tsx
  // Hydrate the persistent thread (Decision #17) — a reload must not lose it.
  useEffect(() => {
    let cancelled = false
    getHistory()
      .then(hist => {
        if (cancelled || hist.length === 0) return
        setMessages(hist.map(h => ({
          id: uid(),
          role: h.role,
          content: h.content,
          timestamp: new Date(h.created_at),
        })))
      })
      .catch(() => { /* fresh thread if history is unavailable */ })
    return () => { cancelled = true }
  }, [])
```

Append to `frontend/src/App.css`:

```css
/* Proactive briefings: assistant-side, visually distinct (Decision #12) */
.message.briefing .message-bubble {
  border-left: 2px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/widgets/ChatWidget.tsx frontend/src/components/widgets/ChatWidget.test.tsx frontend/src/App.css
git commit -m "feat(ui): hydrate chat from /chat/history; distinct briefing style (F0.3)"
```

---

### Task 8: Review panel (frontend slice 2)

**Files:**
- Create: `frontend/src/components/ReviewView.tsx`, `frontend/src/components/ReviewView.css`
- Modify: `frontend/src/App.tsx` (route `review` to the real view)
- Test: `frontend/src/components/ReviewView.test.tsx`

**Interfaces:**
- Consumes: `listProposedMemories, confirmMemory, rejectMemory` from `../api` (Task 5).
- Produces: `ReviewView` component (no props). `App.tsx` renders it for `view === 'review'`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ReviewView.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ReviewView } from './ReviewView'
import * as api from '../api'

vi.mock('../api', () => ({
  listProposedMemories: vi.fn(),
  confirmMemory: vi.fn().mockResolvedValue({ id: 'm1', status: 'confirmed', changed: true }),
  rejectMemory: vi.fn().mockResolvedValue({ id: 'm1', status: 'rejected', changed: true }),
}))

const MEMORY = {
  id: 'm1', type: 'task', title: 'Q3-Report fertigstellen', note: 'bis Freitag',
  confidence: 0.7, source: 'ai_inferred', created_at: '2026-07-06T08:00:00+00:00',
}

beforeEach(() => {
  vi.mocked(api.listProposedMemories).mockReset().mockResolvedValue([MEMORY])
  vi.mocked(api.confirmMemory).mockClear()
  vi.mocked(api.rejectMemory).mockClear()
})

test('renders proposed memories as cards with type and confidence', async () => {
  render(<ReviewView />)
  expect(await screen.findByText('Q3-Report fertigstellen')).toBeInTheDocument()
  expect(screen.getByText('Aufgabe')).toBeInTheDocument()
  expect(screen.getByText('70 % sicher')).toBeInTheDocument()
})

test('Bestätigen confirms and removes the card', async () => {
  render(<ReviewView />)
  await screen.findByText('Q3-Report fertigstellen')
  fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
  await waitFor(() => expect(api.confirmMemory).toHaveBeenCalledWith('m1'))
  expect(screen.queryByText('Q3-Report fertigstellen')).not.toBeInTheDocument()
})

test('Ablehnen rejects and removes the card', async () => {
  render(<ReviewView />)
  await screen.findByText('Q3-Report fertigstellen')
  fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }))
  await waitFor(() => expect(api.rejectMemory).toHaveBeenCalledWith('m1'))
  expect(screen.queryByText('Q3-Report fertigstellen')).not.toBeInTheDocument()
})

test('shows the empty state when the queue is clear', async () => {
  vi.mocked(api.listProposedMemories).mockResolvedValue([])
  render(<ReviewView />)
  expect(await screen.findByText('Keine Vorschläge zur Bestätigung.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ReviewView.test.tsx`
Expected: FAIL — `Cannot find module './ReviewView'`

- [ ] **Step 3: Implement**

Create `frontend/src/components/ReviewView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import './ReviewView.css'
import { confirmMemory, listProposedMemories, rejectMemory } from '../api'
import type { ProposedMemory } from '../api'

const TYPE_LABELS: Record<string, string> = {
  task: 'Aufgabe',
  blocker: 'Blocker',
  decision: 'Entscheidung',
  pattern: 'Muster',
  comm_style: 'Kommunikationsstil',
}

export function ReviewView() {
  const [memories, setMemories] = useState<ProposedMemory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listProposedMemories()
      .then(ms => { if (!cancelled) { setMemories(ms); setLoaded(true) } })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Verbindungsfehler')
          setLoaded(true)
        }
      })
    return () => { cancelled = true }
  }, [])

  const decide = async (id: string, verdict: 'confirm' | 'reject') => {
    setMemories(prev => prev.filter(m => m.id !== id)) // optimistic
    try {
      await (verdict === 'confirm' ? confirmMemory(id) : rejectMemory(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }

  return (
    <section className="review-view" aria-label="Vorgeschlagene Erinnerungen">
      <h1 className="review-title">Review</h1>
      <p className="review-subtitle">Was BumFlow gelernt zu haben glaubt — du entscheidest.</p>
      {error && <div className="error-toast" role="alert">{error}</div>}
      {loaded && memories.length === 0 ? (
        <div className="review-empty glass-2">
          <h2>Alles erledigt</h2>
          <p>Keine Vorschläge zur Bestätigung.</p>
        </div>
      ) : (
        <ul className="review-list">
          {memories.map(m => (
            <li key={m.id} className="review-card glass-2">
              <div className="review-card-head">
                <span className="review-type">{TYPE_LABELS[m.type] ?? m.type}</span>
                <span className="review-confidence">{Math.round(m.confidence * 100)} % sicher</span>
              </div>
              <h3 className="review-card-title">{m.title}</h3>
              {m.note && <p className="review-card-note">{m.note}</p>}
              <div className="review-card-actions">
                <button className="review-confirm" onClick={() => decide(m.id, 'confirm')}>
                  Bestätigen
                </button>
                <button className="review-reject" onClick={() => decide(m.id, 'reject')}>
                  Ablehnen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

Create `frontend/src/components/ReviewView.css`:

```css
.review-view {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.review-title {
  color: var(--fg);
  font-size: 1.5rem;
}

.review-subtitle {
  color: var(--fg-muted);
  margin-bottom: 0.5rem;
}

.review-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
}

.review-card {
  padding: 1.25rem;
  border-radius: 20px;
  animation: fadeIn 0.3s ease;
}

.review-card-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.review-type {
  color: var(--fg);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}

.review-confidence {
  color: var(--fg-faint);
  font-size: 0.75rem;
}

.review-card-title {
  color: var(--fg);
  font-size: 1.05rem;
}

.review-card-note {
  color: var(--fg-muted);
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.review-card-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.review-confirm,
.review-reject {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 0.45rem 1.1rem;
  background: rgba(255, 255, 255, 0.12);
  color: var(--fg);
  cursor: pointer;
}

.review-confirm:hover {
  background: rgba(255, 255, 255, 0.22);
}

.review-reject {
  background: transparent;
  color: var(--fg-muted);
}

.review-empty {
  padding: 2.5rem;
  border-radius: 20px;
  text-align: center;
  color: var(--fg-muted);
}

.review-empty h2 {
  color: var(--fg);
  margin-bottom: 0.5rem;
}
```

Modify `frontend/src/App.tsx`: import `ReviewView` and change the switch case:

```tsx
import { ReviewView } from './components/ReviewView'
```

```tsx
      case 'review':   return <ReviewView />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReviewView.tsx frontend/src/components/ReviewView.css frontend/src/components/ReviewView.test.tsx frontend/src/App.tsx
git commit -m "feat(ui): review panel — confirm/reject proposed memories (slice 2, F0.1)"
```

---

### Task 9: Onboarding dialog (frontend slice 4)

> **SUPERSEDED — skip this task.** The onboarding UI is built by the dedicated wizard plan
> ([2026-07-06-onboarding-wizard.md](2026-07-06-onboarding-wizard.md), spec
> `docs/superpowers/specs/2026-07-06-onboarding-wizard-design.md`), which consumes the same
> backend contract from Task 4 (`/me.onboarded`, `submit_onboarding`). Execute this task only
> if the wizard is explicitly descoped. Task 10's end-to-end verification treats the wizard
> plan's gate (its Task 10) as the onboarding UI.

**Files:**
- Create: `frontend/src/components/OnboardingDialog.tsx`, `frontend/src/components/OnboardingDialog.css`
- Modify: `frontend/src/App.tsx` (gate on `/me.onboarded`)
- Test: `frontend/src/components/OnboardingDialog.test.tsx`

**Interfaces:**
- Consumes: `getOnboardingQuestions, completeOnboarding, getMe` from `../api` (Tasks 4–5).
- Produces: `OnboardingDialog({ onDone: () => void })`; `App` shows it as an overlay while `onboarded === false`. Fail-open: if `/me` errors, chat is never blocked.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/OnboardingDialog.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { OnboardingDialog } from './OnboardingDialog'
import * as api from '../api'

vi.mock('../api', () => ({
  getOnboardingQuestions: vi.fn(),
  completeOnboarding: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
}))

const QUESTIONS = [
  {
    key: 'coaching_style', prompt: 'Wie soll BumFlow mit dir sprechen?', kind: 'choice',
    required: true, options: ['Direkt & fordernd', 'Ausgewogen'], help_text: '',
  },
  {
    key: 'goals', prompt: 'Was sind deine wichtigsten Ziele in diesem Quartal?',
    kind: 'text', required: false, options: [], help_text: 'Optional.',
  },
]

beforeEach(() => {
  vi.mocked(api.getOnboardingQuestions).mockReset().mockResolvedValue(QUESTIONS)
  vi.mocked(api.completeOnboarding).mockClear()
})

test('submit is disabled until the mandatory style is chosen', async () => {
  render(<OnboardingDialog onDone={() => {}} />)
  const submit = await screen.findByRole('button', { name: "Los geht's" })
  expect(submit).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Ausgewogen' }))
  expect(submit).toBeEnabled()
})

test('submits answers and calls onDone', async () => {
  const onDone = vi.fn()
  render(<OnboardingDialog onDone={onDone} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ausgewogen' }))
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  await waitFor(() =>
    expect(api.completeOnboarding).toHaveBeenCalledWith({ coaching_style: 'Ausgewogen' }),
  )
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
})

test('shows backend validation errors instead of closing', async () => {
  vi.mocked(api.completeOnboarding).mockResolvedValue({
    ok: false, errors: ['Unbekannter Coaching-Stil: X'],
  })
  const onDone = vi.fn()
  render(<OnboardingDialog onDone={onDone} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ausgewogen' }))
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unbekannter Coaching-Stil: X')
  expect(onDone).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/OnboardingDialog.test.tsx`
Expected: FAIL — `Cannot find module './OnboardingDialog'`

- [ ] **Step 3: Implement the dialog**

Create `frontend/src/components/OnboardingDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import './OnboardingDialog.css'
import { completeOnboarding, getOnboardingQuestions } from '../api'
import type { OnboardingQuestion } from '../api'

export interface OnboardingDialogProps {
  onDone: () => void
}

export function OnboardingDialog({ onDone }: OnboardingDialogProps) {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getOnboardingQuestions()
      .then(qs => { if (!cancelled) setQuestions(qs) })
      .catch(() => { if (!cancelled) setError('Fragen konnten nicht geladen werden.') })
    return () => { cancelled = true }
  }, [])

  const setAnswer = (key: string, value: string) => {
    setAnswers(prev => {
      const next = { ...prev, [key]: value }
      if (!value.trim()) delete next[key] // skipped optionals send nothing
      return next
    })
  }

  const requiredAnswered = questions
    .filter(q => q.required)
    .every(q => (answers[q.key] ?? '').trim() !== '')

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await completeOnboarding(answers)
      if (res.ok) onDone()
      else setError(res.errors.join(' '))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Onboarding">
      <div className="onboarding-card glass-3">
        <h1>Willkommen bei BumFlow</h1>
        <p className="onboarding-intro">Drei kurze Fragen — nur die erste ist Pflicht.</p>
        {questions.map(q => (
          <fieldset key={q.key} className="onboarding-question">
            <legend>{q.prompt}{q.required ? '' : ' (optional)'}</legend>
            {q.help_text && <p className="onboarding-help">{q.help_text}</p>}
            {q.kind === 'choice' ? (
              <div className="onboarding-options">
                {q.options.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`onboarding-option ${answers[q.key] === opt ? 'selected' : ''}`}
                    aria-pressed={answers[q.key] === opt}
                    onClick={() => setAnswer(q.key, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[q.key] ?? ''}
                onChange={e => setAnswer(q.key, e.target.value)}
                rows={2}
                aria-label={q.prompt}
              />
            )}
          </fieldset>
        ))}
        {error && <div className="error-toast" role="alert">{error}</div>}
        <button
          className="onboarding-submit"
          onClick={submit}
          disabled={!requiredAnswered || saving}
        >
          {saving ? 'Speichern…' : "Los geht's"}
        </button>
      </div>
    </div>
  )
}
```

Create `frontend/src/components/OnboardingDialog.css`:

```css
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.60);
  backdrop-filter: blur(8px);
}

.onboarding-card {
  width: min(560px, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  overflow-y: auto;
  padding: 2rem;
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  color: var(--fg);
}

.onboarding-intro {
  color: var(--fg-muted);
}

.onboarding-question {
  border: none;
  padding: 0;
}

.onboarding-question legend {
  color: var(--fg);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.onboarding-help {
  color: var(--fg-faint);
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.onboarding-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.onboarding-option {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.08);
  color: var(--fg);
  cursor: pointer;
}

.onboarding-option.selected {
  background: rgba(255, 255, 255, 0.28);
  border-color: rgba(255, 255, 255, 0.6);
}

.onboarding-question textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg);
  padding: 0.6rem 0.8rem;
  resize: vertical;
}

.onboarding-submit {
  align-self: flex-end;
  border: none;
  border-radius: 999px;
  padding: 0.65rem 1.5rem;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font-weight: 600;
  cursor: pointer;
}

.onboarding-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 4: Gate the app**

Modify `frontend/src/App.tsx` — add imports and the gate:

```tsx
import { useEffect, useState } from 'react'
```

```tsx
import { OnboardingDialog } from './components/OnboardingDialog'
import { getMe } from './api'
```

Inside `App()`, add below the `view` state:

```tsx
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    getMe()
      .then(me => { if (!cancelled) setOnboarded(me.onboarded) })
      .catch(() => { if (!cancelled) setOnboarded(true) }) // fail open: never block chat
    return () => { cancelled = true }
  }, [])
```

And render the overlay inside the fragment, after `<AmbientBackdrop />`:

```tsx
      {onboarded === false && <OnboardingDialog onDone={() => setOnboarded(true)} />}
```

Note for `frontend/src/App.test.tsx` (if it renders `<App />`): mock `./api` the same way as in Task 6's ChatView test, with `onboarded: true`, so existing shell tests are unaffected.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/OnboardingDialog.tsx frontend/src/components/OnboardingDialog.css frontend/src/components/OnboardingDialog.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(ui): onboarding dialog gated on /me.onboarded (slice 4, F0.4)"
```

---

### Task 10: End-to-end verification + docs

**Files:**
- Modify: `CLAUDE.md` ("What's built & tested" table + NEXT UP), `README.md` if route list is mentioned there

**Interfaces:** none — verification and documentation only.

- [ ] **Step 1: Full test suites**

Run: `python -m pytest -q` — expected: all pass, ~15 more tests than before this plan.
Run: `cd frontend && npx vitest run` — expected: all pass.
Run: `cd frontend && npx tsc --noEmit && npm run build` — expected: clean build.

- [ ] **Step 2: Manual smoke test (this laptop: backend on 8001, Docker Postgres on 5433)**

```bash
docker compose up -d
uvicorn app.main:app --reload --port 8001
```

Temporarily point the `vite.config.ts` proxy at `http://localhost:8001`, run `npm run dev`, then verify in the browser (dev bypass user, MockLLM):
1. First load shows the onboarding dialog; choose a style → dialog closes; reload → it does not reappear.
2. Send "Leg eine Aufgabe an: Q3-Report bis Freitag" → task appears in the sidebar after refresh (MockLLM triggers on task keywords; the extraction path proposes it).
3. Review view lists the proposal; Bestätigen → it moves into `list_tasks` / sidebar.
4. Complete the task via the sidebar checkbox → it disappears.
5. Reload the page → the chat thread is still there.
6. Revert the local `vite.config.ts` proxy change (`git checkout frontend/vite.config.ts`).

- [ ] **Step 3: Update docs**

In `CLAUDE.md`, add rows to the "What's built & tested" table:

```markdown
| Review/task/onboarding actions | `app/actions/{memory_review,tasks,onboarding}.py` | ✅ |
| Chat history endpoint | `app/chat/repository.py` + `/chat/history` | ✅ |
| Frontend slices 2+4 (Review, Onboarding) + live sidebar | `frontend/src/` | ✅ |
```

and change NEXT UP to point at `docs/ROADMAP.md` Phase 1 (proactive scheduler).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: Phase 0 complete — learning loop closed; next up: proactive scheduler"
```

---

## Acceptance criteria traceability (ROADMAP.md Phase 0)

| Roadmap criterion | Where satisfied |
|---|---|
| F0.1 list/reject actions, owner-scoped, no-op reports failure | Task 1 |
| F0.1 reject never an agent tool | Task 1 test `test_reject_memory_registered_as_user_only_write` |
| F0.1 review cards, confirm/reject, empty state, live badge | Tasks 6 + 8 |
| F0.1 confirmed memory reaches next turn's context | existing `load_context` reads `status='confirmed'` — verified in smoke step 3 |
| F0.2 list_tasks overdue-first, agent-callable | Task 2 |
| F0.2 complete_task provenance stamp, fail-closed | Task 2 (`completion_stamp`) |
| F0.2 live TaskWidget + ProfileCard from /me | Task 6 |
| F0.2 "Was steht heute an?" via tools | list_tasks is in `agent_tool_schemas()`; MockLLM scriptable (existing orchestrator tool tests cover dispatch) |
| F0.3 GET /chat/history + reload persistence + briefing style | Tasks 3 + 7 |
| F0.4 gate on onboarded_at, mandatory style, optional rest | Tasks 4 + 9 |
| F0.4 style changes prompt output | stored as confirmed `comm_style` title — the exact row `load_context` reads |
| Global: pure DB-free tests per module | every task's step 1 |
