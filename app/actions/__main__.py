"""CLI adapter (proposed Decision #21): run any action from the shell.

    python -m app.actions <name> '{"json": "args"}'
    python -m app.actions               # list available actions

The CLI is a dev/scripting surface: it uses the dev principal. Production callers go
through HTTP with Entra SSO. Same registry, same handlers — just a different front door.
"""
from __future__ import annotations

import asyncio
import json
import sys

from app.actions.base import ActionContext, registry
from app.auth import CurrentUser
from app.chat.repository import get_or_create_user
from app.config import get_settings
from app.db import SessionLocal
from app.llm import get_llm

# Importing the package registers the built-in actions.
import app.actions  # noqa: E402,F401


def _to_jsonable(result):
    if isinstance(result, list):
        return [r.model_dump(mode="json") if hasattr(r, "model_dump") else r for r in result]
    return result.model_dump(mode="json") if hasattr(result, "model_dump") else result


async def _run() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m app.actions <name> '{json}'", file=sys.stderr)
        print("actions: " + ", ".join(a.name for a in registry.all()), file=sys.stderr)
        return 2

    name = sys.argv[1]
    raw = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    settings = get_settings()
    user = CurrentUser(
        entra_oid="dev-local-user",
        email=settings.dev_user_email,
        display_name=settings.dev_user_name,
    )
    async with SessionLocal() as s:
        user_id = await get_or_create_user(s, user)
    ctx = ActionContext(
        current_user=user, user_id=user_id, session_factory=SessionLocal, llm=get_llm(settings)
    )
    result = await registry.get(name).invoke(raw, ctx)
    print(json.dumps(_to_jsonable(result), ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
