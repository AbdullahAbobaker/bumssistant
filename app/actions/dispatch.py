"""Tool dispatch (Decision #21, steps 3-4): resolve a model tool call to an action and run
it. Safety lives here — tools outside the agent allowlist (read-only or agent_writable) are
refused before any handler runs. Used by /chat to build the dispatch closure.
"""
from __future__ import annotations

from typing import Any

from app.actions.base import ActionContext, registry
from app.llm import ToolCall


def _to_jsonable(result: Any) -> Any:
    """Convert action results (Pydantic models / lists thereof) to JSON-able data so the
    orchestrator can serialize them back to the model."""
    if isinstance(result, list):
        return [r.model_dump(mode="json") if hasattr(r, "model_dump") else r for r in result]
    return result.model_dump(mode="json") if hasattr(result, "model_dump") else result


async def dispatch_tool_call(tc: ToolCall, ctx: ActionContext) -> Any:
    act = registry.get(tc.name)                       # KeyError if unknown
    if not (act.read_only or act.agent_writable):     # curated agent-tool allowlist
        raise PermissionError("tool not permitted")   # no internal name leaked to the model
    return _to_jsonable(await act.invoke(tc.arguments, ctx))
