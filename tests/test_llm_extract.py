"""Pure, DB-free tests for LLM-side extraction (app/llm.py)."""
import asyncio

from app.llm import MemoryCandidate, MockLLM, _build_extract_payload, _parse_candidates


def test_memory_candidate_defaults():
    c = MemoryCandidate(type="task", title="Report schreiben")
    assert c.type == "task" and c.title == "Report schreiben"
    assert c.note == "" and c.confidence == 0.6


def test_mockllm_extract_task_trigger_and_empty():
    m = MockLLM(8)
    got = asyncio.run(m.extract("Ich muss den Nordstern-Report schreiben", "ok"))
    assert len(got) == 1 and got[0].type == "task"
    assert "Ich muss den Nordstern-Report schreiben" in got[0].title
    # no trigger word -> nothing extracted
    assert asyncio.run(m.extract("Schönes Wetter heute", "ok")) == []


def test_mockllm_extract_script_drives_sequence():
    scripted = [MemoryCandidate(type="pattern", title="Plant morgens")]
    m = MockLLM(8, extract_script=[scripted, []])
    assert asyncio.run(m.extract("x", "y"))[0].title == "Plant morgens"
    assert asyncio.run(m.extract("x", "y")) == []


def test_build_extract_payload_forbids_health_and_asks_json():
    p = _build_extract_payload("Ich muss X tun", "ok")
    sys = p["messages"][0]["content"].lower()
    assert "json" in sys
    assert "health" in sys or "mental" in sys or "gesundheit" in sys  # #10 prohibition present
    # the turn is included for the model to extract from
    joined = " ".join(m["content"] for m in p["messages"])
    assert "Ich muss X tun" in joined


def test_parse_candidates_valid_and_malformed():
    data = {"choices": [{"message": {"content":
        '[{"type":"task","title":"Report","note":"bis Fr"},{"type":"pattern","title":"Morgens"}]'
    }}]}
    got = _parse_candidates(data)
    assert [(c.type, c.title) for c in got] == [("task", "Report"), ("pattern", "Morgens")]
    # malformed / non-JSON content -> [] (never raises)
    assert _parse_candidates({"choices": [{"message": {"content": "sorry, none"}}]}) == []
    assert _parse_candidates({"choices": [{"message": {"content": None}}]}) == []
