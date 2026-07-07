"""Onboarding HTTP routes (roadmap F0.4, Decision #13) — the backend half of the
wizard's API contract (docs/superpowers/plans/2026-07-06-onboarding-wizard.md).

Reflections are warm-start inferences reflected back (Decision #9, phase 2). Until the
scan ships (roadmap Phase 2) a new user has no proposed memories, so the list is empty
and the wizard skips the step. Confirm/dismiss rides the propose-then-confirm gate
(Decision #8) — same shape as the confirm_memory / reject_memory actions.
"""
from __future__ import annotations

import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, get_current_user
from app.chat.repository import get_or_create_user
from app.config import Settings, get_settings
from app.db import get_session
from app.llm import get_llm
from app.onboarding.questions import answer_to_write, validate_answer

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class Reflection(BaseModel):
    id: str
    text: str


class ReflectionsOut(BaseModel):
    reflections: list[Reflection]


@router.get("/reflections", response_model=ReflectionsOut)
async def list_reflections(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ReflectionsOut:
    """The user's proposed AI memories, reflected back for confirm/edit/dismiss."""
    user_id = await get_or_create_user(session, user)
    rows = (
        await session.execute(
            text(
                """
                SELECT id, title FROM memories
                WHERE user_id = :uid AND status = 'proposed' AND source = 'ai_inferred'
                ORDER BY created_at DESC
                LIMIT 5
                """
            ),
            {"uid": user_id},
        )
    ).all()
    return ReflectionsOut(reflections=[Reflection(id=str(r.id), text=r.title) for r in rows])


class AnswerIn(BaseModel):
    key: str = Field(..., description="ColdQuestion.key, z. B. coaching_style")
    value: str


@router.post("/answers", status_code=204)
async def save_answer(
    inp: AnswerIn,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Save one answer immediately — the wizard posts per step, so an aborted run loses
    nothing. A direct user answer is Decision #8's auto-confirm path (user_explicit)."""
    error = validate_answer(inp.key, inp.value)
    if error:
        raise HTTPException(status_code=422, detail=error)
    user_id = await get_or_create_user(session, user)
    write = answer_to_write(inp.key, inp.value)
    embedding = await get_llm(settings).embed(write.title)
    qvec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
    details = json.dumps({"kind": write.detail_kind} if write.detail_kind else {})
    await session.execute(
        text(
            """
            INSERT INTO memories (user_id, type, title, details, source,
                                  confidence, status, confirmed_at, embedding)
            VALUES (:uid, CAST(:type AS memory_type), :title, CAST(:details AS jsonb),
                    'user_explicit', 1.0, 'confirmed', now(), CAST(:qvec AS vector))
            """
        ),
        {"uid": user_id, "type": write.type, "title": write.title,
         "details": details, "qvec": qvec},
    )
    await session.commit()


class ReflectionDecisionIn(BaseModel):
    action: Literal["confirm", "dismiss"]
    text: str | None = None  # edit = confirm with corrected text


@router.post("/reflections/{reflection_id}", status_code=204)
async def decide_reflection(
    reflection_id: UUID,
    inp: ReflectionDecisionIn,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Owner-scoped, only flips 'proposed' rows — the same gate as confirm/reject_memory."""
    user_id = await get_or_create_user(session, user)
    if inp.action == "confirm":
        await session.execute(
            text(
                """
                UPDATE memories
                SET status = 'confirmed', confirmed_at = now(), updated_at = now(),
                    title = COALESCE(:text, title)
                WHERE id = CAST(:rid AS uuid) AND user_id = :uid AND status = 'proposed'
                """
            ),
            {"rid": str(reflection_id), "uid": user_id, "text": inp.text},
        )
    else:
        await session.execute(
            text(
                """
                UPDATE memories
                SET status = 'rejected', updated_at = now()
                WHERE id = CAST(:rid AS uuid) AND user_id = :uid AND status = 'proposed'
                """
            ),
            {"rid": str(reflection_id), "uid": user_id},
        )
    await session.commit()


@router.post("/complete", status_code=204)
async def complete_onboarding(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    user_id = await get_or_create_user(session, user)
    await session.execute(
        text(
            "UPDATE users SET onboarded_at = now() "
            "WHERE id = :uid AND onboarded_at IS NULL"
        ),
        {"uid": user_id},
    )
    await session.commit()
