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
