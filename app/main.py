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
from app.chat.repository import DbChatPort, fetch_history, get_or_create_user
from app.config import Settings, get_settings
from app.db import SessionLocal, get_session
from app.llm import ToolCall, get_llm
from app.onboarding.http import router as onboarding_router

app = FastAPI(title="Bumssistant", version="0.1.0")


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


class HistoryMessage(BaseModel):
    role: str
    content: str
    created_at: str


class HistoryResponse(BaseModel):
    messages: list[HistoryMessage]


@app.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    """Liveness + DB connectivity — the first thing to check when something breaks."""
    db_ok = (await session.execute(text("SELECT 1"))).scalar() == 1
    return {"status": "ok", "db": db_ok}


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
    tools = registry.agent_tool_schemas()
    ctx = ActionContext(
        current_user=user, user_id=user_id, session_factory=SessionLocal, llm=llm,
        initiator="agent",
    )

    async def dispatch(tc: ToolCall):
        return await dispatch_tool_call(tc, ctx)

    reply = await handle_turn(
        user_id, req.message, port=port, llm=llm, runner=get_runner(),
        tools=tools, dispatch=dispatch,
    )
    return ChatResponse(reply=reply)


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


# Mount the action registry (GET /actions catalog + POST /actions/{name} dispatcher).
mount_actions(app)
app.include_router(onboarding_router)
