"""Pure, DB-free tests for the Action primitive (proposed Decision #21).

The handlers hit the DB (exercised via the running app); here we lock the primitive's
logic: verb mapping, tool-schema shape, validate-then-dispatch, registry behavior, and
that the built-in actions register with the right metadata.
"""
import asyncio

import pytest
from pydantic import BaseModel, ValidationError

from app.actions import registry
from app.actions.base import Action, Registry


class _In(BaseModel):
    x: int


async def _handler(inp, ctx):
    return {"got": inp.x, "ctx": ctx}


def _echo(read_only: bool = True) -> Action:
    return Action(
        name="echo", description="d", input_model=_In, handler=_handler, read_only=read_only
    )


def test_read_only_maps_to_http_verb():
    assert _echo(read_only=True).http_method == "GET"
    assert _echo(read_only=False).http_method == "POST"


def test_tool_schema_is_a_function_tool_with_pydantic_params():
    ts = _echo().tool_schema()
    assert ts["type"] == "function"
    assert ts["function"]["name"] == "echo"
    assert "x" in ts["function"]["parameters"]["properties"]


def test_invoke_validates_before_running_handler():
    a = _echo()
    # valid input flows to the handler
    assert asyncio.run(a.invoke({"x": 5}, ctx="CTX")) == {"got": 5, "ctx": "CTX"}
    # invalid input raises at validation — handler (and ctx) never touched
    with pytest.raises(ValidationError):
        asyncio.run(a.invoke({}, ctx=None))


def test_registry_registers_gets_and_rejects_duplicates():
    r = Registry()
    a = _echo()
    r.register(a)
    assert r.get("echo") is a
    with pytest.raises(ValueError):
        r.register(_echo())          # duplicate name
    with pytest.raises(KeyError):
        r.get("does-not-exist")


def test_tool_schemas_filter_to_read_only_subset():
    r = Registry()
    r.register(Action("safe", "d", _In, _handler, read_only=True))
    r.register(Action("write", "d", _In, _handler, read_only=False))
    assert {t["function"]["name"] for t in r.tool_schemas(read_only=True)} == {"safe"}
    assert len(r.tool_schemas()) == 2


def test_builtin_actions_registered_with_expected_metadata():
    by = {a.name: a for a in registry.all()}
    assert {"list_projects", "create_task", "confirm_memory"} <= set(by)
    assert by["list_projects"].read_only and by["list_projects"].http_method == "GET"
    assert not by["create_task"].read_only and by["create_task"].http_method == "POST"
    # create_task requires a title (schema-validated before any DB work)
    with pytest.raises(ValidationError):
        by["create_task"].input_model.model_validate({})


def test_action_agent_writable_flag():
    assert Action("x", "d", _In, _handler).agent_writable is False
    assert Action("y", "d", _In, _handler, agent_writable=True).agent_writable is True


def test_agent_tool_schemas_offers_reads_and_agent_writes_only():
    names = {t["function"]["name"] for t in registry.agent_tool_schemas()}
    assert "list_projects" in names   # read-only
    assert "create_task" in names     # agent_writable
    assert "confirm_memory" not in names  # neither -> never offered to the model


def test_is_agent_tool_predicate():
    from app.actions.base import is_agent_tool

    assert is_agent_tool(Action("r", "d", _In, _handler, read_only=True)) is True
    assert is_agent_tool(Action("w", "d", _In, _handler, agent_writable=True)) is True  # permitted
    assert is_agent_tool(Action("n", "d", _In, _handler)) is False  # neither -> refused


def test_action_context_initiator_defaults_to_user():
    from app.actions.base import ActionContext

    ctx = ActionContext(current_user=None, user_id="u", session_factory=None, llm=None)
    assert ctx.initiator == "user"
    assert ActionContext(None, "u", None, None, initiator="agent").initiator == "agent"
