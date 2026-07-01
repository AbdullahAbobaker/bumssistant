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


def test_write_tool_refused_before_db():
    # create_task is read_only=False -> refused before invoke, so ctx=None never used
    with pytest.raises(PermissionError):
        asyncio.run(dispatch_tool_call(ToolCall("c1", "create_task", {"title": "x"}), ctx=None))


def test_to_jsonable_handles_pydantic_and_lists():
    class M(BaseModel):
        a: int

    assert _to_jsonable([M(a=1), M(a=2)]) == [{"a": 1}, {"a": 2}]
    assert _to_jsonable(M(a=3)) == {"a": 3}
    assert _to_jsonable({"x": 1}) == {"x": 1}
