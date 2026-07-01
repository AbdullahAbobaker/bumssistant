"""Pure, DB-free test for create_task provenance selection (app/actions/builtin.py)."""
from app.actions.builtin import _task_provenance


def test_task_provenance_agent_proposes():
    assert _task_provenance("agent") == ("ai_inferred", 0.7, "proposed")


def test_task_provenance_user_confirms():
    assert _task_provenance("user") == ("user_explicit", 1.0, "confirmed")
