"""HTTP adapter (proposed Decision #21): mount the action registry onto FastAPI with a
single generic dispatcher — no per-action route code.

  GET  /actions          → catalog (name, verb, input schema)
  POST /actions/{name}    → invoke; JSON body validated by the action's Pydantic schema
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.actions.base import ActionContext, registry
from app.auth import CurrentUser, get_current_user
from app.chat.repository import get_or_create_user
from app.config import Settings, get_settings
from app.db import SessionLocal, get_session
from app.llm import get_llm


def mount_actions(app: FastAPI) -> None:
    @app.get("/actions", tags=["actions"])
    async def list_actions() -> list[dict]:
        """Catalog every registered action, its verb, and its input schema."""
        return [
            {
                "name": a.name,
                "description": a.description,
                "read_only": a.read_only,
                "method": a.http_method,
                "schema": a.input_model.model_json_schema(),
            }
            for a in registry.all()
        ]

    @app.post("/actions/{name}", tags=["actions"])
    async def invoke_action(
        name: str,
        payload: dict[str, Any] | None = None,
        user: CurrentUser = Depends(get_current_user),
        settings: Settings = Depends(get_settings),
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        try:
            act = registry.get(name)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown action: {name}")
        user_id = await get_or_create_user(session, user)
        ctx = ActionContext(
            current_user=user,
            user_id=user_id,
            session_factory=SessionLocal,
            llm=get_llm(settings),
        )
        try:
            return await act.invoke(payload, ctx)
        except ValidationError as e:
            raise HTTPException(
                status_code=422,
                detail=[
                    {"loc": list(err.get("loc", ())), "msg": err.get("msg"), "type": err.get("type")}
                    for err in e.errors()
                ],
            )
