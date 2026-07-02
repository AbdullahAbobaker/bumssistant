"""Pure, DB-free tests for the memory extractor (app/memory/extraction.py)."""
from app.llm import MemoryCandidate
from app.memory.extraction import clamp_confidence, dedupe, filter_candidates


def test_filter_keeps_allowed_types_with_titles():
    kept = filter_candidates([
        MemoryCandidate(type="task", title="  Report schreiben  "),   # kept + title stripped
        MemoryCandidate(type="pattern", title="Plant morgens"),       # kept
        MemoryCandidate(type="blocker", title="Warten auf X"),        # wrong type -> dropped
        MemoryCandidate(type="task", title="   "),                    # empty after strip -> dropped
    ])
    assert [(c.type, c.title) for c in kept] == [
        ("task", "Report schreiben"), ("pattern", "Plant morgens")
    ]


def test_filter_drops_health_and_mental_state():
    kept = filter_candidates([
        MemoryCandidate(type="pattern", title="Hat Burnout-Symptome"),        # deny-list
        MemoryCandidate(type="task", title="Termin", note="wegen Depression"),  # deny-list in note
        MemoryCandidate(type="task", title="Report schreiben"),                # clean -> kept
    ])
    assert [c.title for c in kept] == ["Report schreiben"]


def test_dedupe_drops_existing_and_intra_batch():
    existing = {"report schreiben"}
    kept = dedupe([
        MemoryCandidate(type="task", title="Report schreiben"),   # matches existing (case-insens)
        MemoryCandidate(type="task", title="Neue Aufgabe"),       # new
        MemoryCandidate(type="task", title="neue aufgabe"),       # dup within batch
    ], existing)
    assert [c.title for c in kept] == ["Neue Aufgabe"]


def test_clamp_confidence():
    assert clamp_confidence(-1.0) == 0.0
    assert clamp_confidence(2.0) == 1.0
    assert clamp_confidence(0.6) == 0.6
