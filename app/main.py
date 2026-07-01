"""Bumssistant API entrypoint.

Run locally:  uvicorn app.main:app --reload
Docs:         http://localhost:8000/docs
"""
from fastapi import Depends, FastAPI
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import app.actions  # noqa: F401  registers built-in actions into the registry
from app.actions import registry
from app.actions.base import ActionContext
from app.actions.dispatch import dispatch_tool_call
from app.actions.http import mount_actions
from app.auth import CurrentUser, get_current_user
from app.background import get_runner
from app.chat.orchestrator import handle_turn
from app.chat.repository import DbChatPort, get_or_create_user
from app.config import Settings, get_settings
from app.db import SessionLocal, get_session
from app.llm import ToolCall, get_llm

app = FastAPI(title="Bumssistant", version="0.1.0")


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@app.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    """Liveness + DB connectivity — the first thing to check when something breaks."""
    db_ok = (await session.execute(text("SELECT 1"))).scalar() == 1
    return {"status": "ok", "db": db_ok}


@app.get("/me")
async def me(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Who am I? Confirms auth (real or dev-bypass) and the active safety mode."""
    return {
        "email": user.email,
        "display_name": user.display_name,
        "environment": settings.environment,
        "warm_start_scan_mode": settings.effective_scan_mode,
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
) -> ChatResponse:
    """Talk to BumFlow. Resolves the user, then runs the full chat loop:
    log turn → retrieve memory → BumFlow prompt → LLM → log reply → async learn."""
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


# Mount the action registry (GET /actions catalog + POST /actions/{name} dispatcher).
mount_actions(app)
