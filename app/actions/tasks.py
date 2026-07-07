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
