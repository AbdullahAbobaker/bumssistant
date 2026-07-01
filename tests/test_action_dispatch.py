"""Pure, DB-free tests for tool dispatch safety (app/actions/dispatch.py).

Unknown/write tools are rejected BEFORE the handler runs, so no DB is needed.
"""
import asyncio

import pytest

from app.actions import registry  # noqa: F401  triggers built-in registration
from app.actions.dispatch import _to_jsonable, dispatch_tool_call
from app.llm import ToolCall
from pydantic import BaseModel


def test_unknown_tool_raises_keyerror():
    with pytest.raises(KeyError):
        asyncio.run(dispatch_tool_call(ToolCall("c1", "does_not_exist", {}), ctx=None))


def test_non_agent_tool_refused_before_db():
    # confirm_memory is neither read_only nor agent_writable -> refused before invoke, so
    # ctx=None is never dereferenced; and the error must not leak the internal action name.
    with pytest.raises(PermissionError) as exc:
        asyncio.run(
            dispatch_tool_call(
                ToolCall("c1", "confirm_memory", {"memory_id": "00000000-0000-0000-0000-000000000000"}),
                ctx=None,
            )
        )
    assert "confirm_memory" not in str(exc.value)


def test_to_jsonable_handles_pydantic_and_lists():
    class M(BaseModel):
        a: int

    assert _to_jsonable([M(a=1), M(a=2)]) == [{"a": 1}, {"a": 2}]
    assert _to_jsonable(M(a=3)) == {"a": 3}
    assert _to_jsonable({"x": 1}) == {"x": 1}
