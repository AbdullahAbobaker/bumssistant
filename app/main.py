"""Bumssistant API entrypoint.

Run locally:  uvicorn app.main:app --reload
Docs:         http://localhost:8000/docs
"""
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.db import get_session

app = FastAPI(title="Bumssistant", version="0.1.0")


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
