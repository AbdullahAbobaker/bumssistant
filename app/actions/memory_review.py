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
