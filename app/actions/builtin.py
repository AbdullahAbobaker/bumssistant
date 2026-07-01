"""Built-in BumFlow actions (proposed Decision #21).

Each capability is defined once here and becomes an HTTP endpoint, an agent tool, and a
CLI command via the registry. Handlers follow the same raw-SQL + session-per-call
discipline as app/chat/repository.py.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import text

from app.actions.base import ActionContext, action


class NoArgs(BaseModel):
    """Input model for actions that take no arguments."""


class ProjectOut(BaseModel):
    id: str
    name: str
    status: str


@action(
    name="list_projects",
    description="Liste die aktiven Projekte der Person auf.",
    read_only=True,
)
async def list_projects(inp: NoArgs, ctx: ActionContext) -> list[ProjectOut]:
    async with ctx.session_factory() as s:
        rows = (
            await s.execute(
                text(
                    """
                    SELECT id, name, status FROM projects
                    WHERE user_id = :uid AND status = 'active'
                    ORDER BY updated_at DESC
                    """
                ),
                {"uid": ctx.user_id},
            )
        ).all()
    return [ProjectOut(id=str(r.id), name=r.name, status=r.status) for r in rows]


def _task_provenance(initiator: str) -> tuple[str, float, str]:
    """(source, confidence, status) for a create_task call. A model-initiated task is a
    suggestion — it lands 'proposed' for the user to confirm (Decision #8/#14). A user
    acting directly (HTTP /actions, CLI) auto-confirms."""
    if initiator == "agent":
        return ("ai_inferred", 0.7, "proposed")
    return ("user_explicit", 1.0, "confirmed")


class CreateTaskIn(BaseModel):
    title: str = Field(..., description="Kurzer Titel der Aufgabe")
    note: str | None = Field(None, description="Optionale Details")
    due_at: datetime | None = Field(None, description="Fällig am (ISO 8601), optional")


class CreateTaskOut(BaseModel):
    id: str
    status: str


@action(
    name="create_task",
    description="Lege eine Aufgabe für die Person an.",
    read_only=False,
    agent_writable=True,
)
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


class ConfirmMemoryIn(BaseModel):
    memory_id: UUID = Field(..., description="ID der vorgeschlagenen Erinnerung")


class ConfirmMemoryOut(BaseModel):
    id: str
    status: str
    changed: bool


@action(
    name="confirm_memory",
    description="Bestätige eine vorgeschlagene Erinnerung (proposed → confirmed).",
    read_only=False,
)
async def confirm_memory(inp: ConfirmMemoryIn, ctx: ActionContext) -> ConfirmMemoryOut:
    # Propose-then-confirm gate (Decision #8): only the owner can flip their own
    # 'proposed' memory to 'confirmed'. Scoped by user_id + status in the WHERE clause.
    async with ctx.session_factory() as s:
        row = (
            await s.execute(
                text(
                    """
                    UPDATE memories
                    SET status = 'confirmed', confirmed_at = now(), updated_at = now()
                    WHERE id = CAST(:mid AS uuid) AND user_id = :uid AND status = 'proposed'
                    RETURNING id, status
                    """
                ),
                {"mid": str(inp.memory_id), "uid": ctx.user_id},
            )
        ).first()
        await s.commit()
    if row is None:  # not found, not owned, or not currently 'proposed'
        return ConfirmMemoryOut(id=str(inp.memory_id), status="unchanged", changed=False)
    return ConfirmMemoryOut(id=str(row.id), status=str(row.status), changed=True)
