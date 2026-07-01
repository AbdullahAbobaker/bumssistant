"""Pure, DB-free test for create_task provenance selection (app/actions/builtin.py)."""
from app.actions.builtin import _task_provenance


def test_task_provenance_agent_proposes():
    assert _task_provenance("agent") == ("ai_inferred", 0.7, "proposed")


def test_task_provenance_user_confirms():
    assert _task_provenance("user") == ("user_explicit", 1.0, "confirmed")


def test_task_provenance_unknown_initiator_fails_closed():
    # any non-"user" initiator (typo, future value) must land 'proposed', never auto-confirm
    assert _task_provenance("integration") == ("ai_inferred", 0.7, "proposed")
    assert _task_provenance("") == ("ai_inferred", 0.7, "proposed")
