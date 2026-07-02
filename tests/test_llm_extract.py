"""Pure, DB-free tests for LLM-side extraction (app/llm.py)."""
import asyncio

from app.llm import MemoryCandidate, MockLLM


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
