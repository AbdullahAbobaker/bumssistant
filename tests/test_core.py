"""Core brain tests — run with `python -m pytest` from the project root.

These capture every invariant we validated while building. No DB required:
the whole brain is tested through mocks (that's the reliability payoff).
"""
import asyncio

from app.background import InProcessRunner
from app.chat.orchestrator import TurnContext, handle_turn
from app.chat.session import Msg, build_window, needs_resummarize
from app.llm import ChatMessage, MockLLM, get_llm
from app.memory.retrieval import Candidate, score, select_for_context
from app.onboarding.questions import COACHING_STYLES, is_complete, required_keys
from app.persona import TONE_MODIFIERS, build_system_prompt
from app.proactive.engine import BriefingContext, compose_morning_briefing


# --- persona -----------------------------------------------------------------
def test_every_coaching_style_has_a_tone_modifier():
    assert not [s for s in COACHING_STYLES if s not in TONE_MODIFIERS]


def test_persona_injects_memory_and_falls_back_safely():
    p = build_system_prompt("Direkt & fordernd", "Arbeitet an Nordstern.", "Anna")
    assert "fordernd" in p and "Nordstern" in p and "Anna" in p
    assert build_system_prompt(None)  # unknown/None style must not crash


# --- onboarding --------------------------------------------------------------
def test_onboarding_requires_only_coaching_style():
    assert required_keys() == ["coaching_style"]
    assert not is_complete({})
    assert is_complete({"coaching_style": "Ausgewogen"})


# --- proactive ---------------------------------------------------------------
def test_briefing_self_suppresses_when_empty():
    assert compose_morning_briefing(BriefingContext(display_name="Anna")) is None
    msg = compose_morning_briefing(
        BriefingContext(display_name="Anna", tasks_due_today=["Nordstern-Report"])
    )
    assert msg and "Nordstern" in msg


# --- retrieval ---------------------------------------------------------------
def test_retrieval_ranks_and_filters():
    a = Candidate("a", "Nordstern", 0.9, 0.8, 1, 0.9, 1.0)
    b = Candidate("b", "old", 0.4, 0.1, 180, 0.2, 0.6)
    stale = Candidate("c", "stale", 0.99, 0.9, 2, 0.9, 1.0, superseded=True)
    assert score(a) > score(b)
    ids = [c.id for c in select_for_context([a, b, stale])]
    assert "c" not in ids and ids[0] == "a"


# --- working memory ----------------------------------------------------------
def test_window_keeps_tail_plus_summary():
    msgs = [Msg("user", f"m{i}") for i in range(30)]
    w = build_window(msgs, "Zusammenfassung", window_turns=5)
    assert len(w.recent) == 10 and w.recent[-1].content == "m29"
    assert needs_resummarize(30, 5) and not needs_resummarize(4, 5)


# --- llm ---------------------------------------------------------------------
def test_dev_uses_mock_llm_and_embeddings_are_deterministic():
    client = get_llm()
    assert isinstance(client, MockLLM)
    e1 = asyncio.run(client.embed("hallo"))
    e2 = asyncio.run(client.embed("hallo"))
    assert e1 == e2 and len(e1) == 1536


# --- orchestrator (full loop, mocked) ----------------------------------------
class _FakePort:
    def __init__(self):
        self.log = []
        self.extracted = []

    async def load_context(self, user_id, user_text):
        return TurnContext(
            display_name="Anna",
            coaching_style="Direkt & fordernd",
            rolling_summary="Anna arbeitet an Nordstern.",
            recent=[Msg("user", "Hi"), Msg("assistant", "Moin.")],
            always_on_summary="Heute fällig: Nordstern-Report.",
            memory_candidates=[Candidate("m1", "Nordstern-Report", 0.9, 0.8, 1, 0.9, 1.0)],
        )

    async def log_message(self, user_id, role, content):
        self.log.append((role, content))

    async def extract_memories(self, user_id, user_text, reply):
        self.extracted.append(user_text)


def test_full_turn_logs_replies_and_extracts_async():
    async def run():
        port, runner = _FakePort(), InProcessRunner()
        reply = await handle_turn("u1", "Was steht an?", port=port, llm=MockLLM(8), runner=runner)
        await asyncio.sleep(0)  # let fire-and-forget extraction run
        assert reply
        assert [r for r, _ in port.log] == ["user", "assistant"]
        assert port.extracted == ["Was steht an?"]

    asyncio.run(run())
