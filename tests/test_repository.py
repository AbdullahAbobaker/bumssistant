"""Pure, DB-free tests for the DB-backed ChatPort helpers (app/chat/repository.py).

The SQL lives in DbChatPort and is exercised via the running app; here we lock the
logic worth trusting: keyword normalization, the always-on line, incoming-message
exclusion from the window, and row->Candidate mapping.
"""
from types import SimpleNamespace

from app.chat.repository import (
    compose_always_on,
    normalize_keyword_ranks,
    prior_turns,
    row_to_candidate,
)


def test_normalize_keyword_ranks_scales_to_unit_max():
    assert normalize_keyword_ranks([]) == []
    assert normalize_keyword_ranks([0.0, 0.0]) == [0.0, 0.0]   # no hits -> all zero
    assert normalize_keyword_ranks([0.2, 0.8]) == [0.25, 1.0]  # scaled to batch max


def test_compose_always_on_omits_empty_sections():
    assert compose_always_on([], []) == ""
    assert compose_always_on(["Nordstern"], []) == "Aktive Projekte: Nordstern."
    line = compose_always_on(["Nordstern"], ["Report"])
    assert "Nordstern" in line and "Report" in line


def test_prior_turns_drops_incoming_and_orders_chronologically():
    # DB rows arrive newest-first; the newest is the just-logged incoming user turn.
    rows = [
        SimpleNamespace(role="user", content="incoming"),      # dropped
        SimpleNamespace(role="assistant", content="a1"),
        SimpleNamespace(role="user", content="u1"),
    ]
    turns = [(m.role, m.content) for m in prior_turns(rows)]
    assert turns == [("user", "u1"), ("assistant", "a1")]
    assert prior_turns([SimpleNamespace(role="user", content="only")]) == []


def test_row_to_candidate_maps_fields_and_flags():
    row = SimpleNamespace(
        id="m1", title="Nordstern", semantic_sim=0.9, age_days=3,
        importance=0.7, confidence=0.8, superseded=False, expired=True,
    )
    c = row_to_candidate(row, keyword_rank=0.5)
    assert c.id == "m1" and c.title == "Nordstern"
    assert c.semantic_sim == 0.9 and c.keyword_rank == 0.5
    assert c.expired and not c.superseded
