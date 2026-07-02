"""MCP adapter (Decision #21, step 5): expose READ-ONLY registry actions as MCP tools.

Pure mapping (mcp_tool_defs, resolve_read_tool) is DB- and dependency-free and unit-tested.
The mcp SDK and the context/DB deps are imported lazily inside serve()/_mcp_context(), so these
functions and their tests need no `mcp` install and touch no database.
"""
from __future__ import annotations

from app.actions.base import Action, registry


def mcp_tool_defs() -> list[dict]:
    """Read-only registry actions as MCP tool descriptors. MCP uses `inputSchema` (distinct
    from the OpenAI `tool_schema()` wrapper)."""
    return [
        {
            "name": a.name,
            "description": a.description,
            "inputSchema": a.input_model.model_json_schema(),
        }
        for a in registry.all()
        if a.read_only
    ]


def resolve_read_tool(name: str) -> Action:
    """Resolve a tool name to a read-only action, or refuse. Defense in depth: even if a client
    names a write action, it is refused here — not merely absent from the list."""
    act = registry.get(name)                          # KeyError if unknown
    if not act.read_only:
        raise PermissionError("tool not permitted")   # no internal name leaked
    return act


async def _mcp_context():
    """Build the ActionContext for an MCP call. Local dev principal (same as the CLI);
    initiator='mcp' so any FUTURE write exposure fails closed to 'proposed'. Deps are
    imported here (not at module top) to keep the pure functions dependency-light."""
    from app.actions.base import ActionContext
    from app.auth import CurrentUser
    from app.chat.repository import get_or_create_user
    from app.config import get_settings
    from app.db import SessionLocal
    from app.llm import get_llm

    settings = get_settings()
    user = CurrentUser(
        entra_oid="dev-local-user",
        email=settings.dev_user_email,
        display_name=settings.dev_user_name,
    )
    async with SessionLocal() as s:
        user_id = await get_or_create_user(s, user)
    return ActionContext(
        current_user=user,
        user_id=user_id,
        session_factory=SessionLocal,
        llm=get_llm(settings),
        initiator="mcp",
    )


async def serve() -> None:
    """Run the stdio MCP server exposing read-only actions. Imports the mcp SDK lazily so the
    pure functions above stay dependency-free."""
    import json

    import mcp.types as types
    from mcp.server import Server
    from mcp.server.stdio import stdio_server

    from app.actions.dispatch import _to_jsonable

    server = Server("bumssistant")

    @server.list_tools()
    async def _list_tools() -> list[types.Tool]:
        return [types.Tool(**d) for d in mcp_tool_defs()]

    @server.call_tool()
    async def _call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
        act = resolve_read_tool(name)                 # KeyError/PermissionError -> SDK tool error
        ctx = await _mcp_context()
        result = _to_jsonable(await act.invoke(arguments or {}, ctx))
        return [types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, default=str))]

    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio

    asyncio.run(serve())
