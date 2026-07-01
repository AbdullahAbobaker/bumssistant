"""Tool dispatch (proposed Decision #21, step 3): resolve a model tool call to an action
and run it. Safety lives here — non-read-only tools are refused before any handler runs.
Used by the /chat endpoint to build the dispatch closure handed to the orchestrator.
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
    if not act.read_only:                             # defense in depth (only read-only offered)
        raise PermissionError(f"non-read-only tool refused: {tc.name}")
    return _to_jsonable(await act.invoke(tc.arguments, ctx))
