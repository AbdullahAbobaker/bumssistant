"""Pure, DB-free tests for the memory-review actions (roadmap F0.1).

Handlers hit the DB (exercised via the running app); here we lock registration
metadata, agent exposure, and schema validation — the safety-relevant parts.
"""
import pytest
from pydantic import ValidationError

from app.actions import registry
from app.actions.base import is_agent_tool


def test_list_proposed_memories_registered_read_only():
    a = registry.get("list_proposed_memories")
    assert a.read_only is True
    assert a.http_method == "GET"


def test_reject_memory_registered_as_user_only_write():
    a = registry.get("reject_memory")
    assert a.read_only is False
    assert a.agent_writable is False
    # the single safety predicate: never offered to / dispatchable by the model
    assert is_agent_tool(a) is False


def test_reject_memory_requires_a_valid_uuid():
    a = registry.get("reject_memory")
    with pytest.raises(ValidationError):
        a.input_model.model_validate({})
    with pytest.raises(ValidationError):
        a.input_model.model_validate({"memory_id": "not-a-uuid"})


def test_agent_tools_include_list_but_never_reject():
    names = {t["function"]["name"] for t in registry.agent_tool_schemas()}
    assert "list_proposed_memories" in names
    assert "reject_memory" not in names
