"""Pure, DB-free tests for the task actions (roadmap F0.2)."""
import pytest
from pydantic import ValidationError

from app.actions import registry
from app.actions.tasks import completion_stamp


def test_completion_stamp_fails_closed():
    # only a direct user counts as 'user'; anything else (agent, typo, future value)
    # is stamped 'agent' — same fail-closed shape as _task_provenance
    assert completion_stamp("user") == "user"
    assert completion_stamp("agent") == "agent"
    assert completion_stamp("mcp") == "agent"
    assert completion_stamp("") == "agent"


def test_list_tasks_registered_read_only():
    a = registry.get("list_tasks")
    assert a.read_only is True
    assert a.http_method == "GET"


def test_complete_task_registered_agent_writable():
    a = registry.get("complete_task")
    assert a.read_only is False
    assert a.agent_writable is True  # BumFlow may mark done on explicit user say-so


def test_complete_task_requires_a_valid_uuid():
    a = registry.get("complete_task")
    with pytest.raises(ValidationError):
        a.input_model.model_validate({})
    with pytest.raises(ValidationError):
        a.input_model.model_validate({"task_id": "nope"})


def test_agent_tools_include_both_task_actions():
    names = {t["function"]["name"] for t in registry.agent_tool_schemas()}
    assert {"list_tasks", "complete_task"} <= names
