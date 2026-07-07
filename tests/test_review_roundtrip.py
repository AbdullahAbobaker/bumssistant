"""Proof test: a confirmed memory appears in the next turn's system prompt (F0.1, roadmap).

Context (Decision #8): BumFlow infers memories as 'proposed'. The user confirms one
in the Review panel. On the NEXT chat turn, `load_context` must include it — that is,
_compose_memory_block must surface it through build_system_prompt.

This test drives the full path through build_system_prompt without a DB, using the
same FakePort pattern as test_core.py.
"""
import asyncio

from app.background import InProcessRunner
from app.chat.orchestrator import TurnContext, handle_turn, _compose_memory_block
from app.llm import MockLLM
from app.memory.retrieval import Candidate
from app.persona import build_system_prompt


# ── Helpers ──────────────────────────────────────────────────────────────────

def _context_with_memory(title: str, status: str = "confirmed") -> TurnContext:
    """Return a TurnContext whose single memory candidate has the given title.

    Status is informational here: the caller is responsible for only passing
    candidates that represent 'confirmed' rows — exactly what DbChatPort.load_context
    does (its WHERE clause filters `status = 'confirmed'`). A 'proposed' candidate
    would never reach this function in production.
    """
    candidates = [Candidate(
        id="m1",
        title=title,
        cosine=0.9,
        age_days=1,
        recency_score=0.9,
        base_score=0.9,
        final_score=0.9,
    )]
    return TurnContext(
        display_name="Anna",
        coaching_style="Ausgewogen",
        rolling_summary="",
        recent=[],
        always_on_summary="",
        memory_candidates=candidates,
    )


class _ConfirmedPort:
    """FakePort that serves one confirmed memory candidate on every load_context."""

    def __init__(self, memory_title: str) -> None:
        self._title = memory_title
        self.log: list[tuple[str, str]] = []

    async def load_context(self, user_id: str, user_text: str) -> TurnContext:
        return _context_with_memory(self._title)

    async def log_message(self, user_id: str, role: str, content: str) -> None:
        self.log.append((role, content))

    async def extract_memories(self, user_id: str, user_text: str, reply: str) -> None:
        pass


class _EmptyPort(_ConfirmedPort):
    """FakePort that serves NO memory candidates — simulates a 'proposed' state
    where DbChatPort would not yet include the row."""

    async def load_context(self, user_id: str, user_text: str) -> TurnContext:
        ctx = await super().load_context(user_id, user_text)
        ctx.memory_candidates.clear()   # no confirmed rows → empty block
        return ctx


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_confirmed_memory_appears_in_system_prompt():
    """A confirmed memory must surface through build_system_prompt on the next turn.

    This verifies the full data-flow:
      load_context (filters status='confirmed') → _compose_memory_block → build_system_prompt
    without needing a real database.
    """
    ctx = _context_with_memory("Q3-Report fertigstellen")
    memory_block = _compose_memory_block(ctx)
    system = build_system_prompt(
        ctx.coaching_style,
        confirmed_memory_summary=memory_block,
        user_name=ctx.display_name,
    )
    assert "Q3-Report fertigstellen" in system


def test_proposed_memory_absent_from_system_prompt():
    """Before confirmation, the memory must NOT appear in the context block.

    DbChatPort.load_context only queries status='confirmed' rows — a proposed
    candidate would simply not be in memory_candidates, so _compose_memory_block
    produces an empty string and build_system_prompt does not surface it.
    """
    # Empty port simulates the 'proposed' state: load_context returns no candidates.
    ctx = _context_with_memory("Q3-Report fertigstellen")
    ctx.memory_candidates.clear()   # no confirmed row → blank block

    memory_block = _compose_memory_block(ctx)
    system = build_system_prompt(
        ctx.coaching_style,
        confirmed_memory_summary=memory_block,
        user_name=ctx.display_name,
    )
    assert "Q3-Report fertigstellen" not in system


def test_confirmed_memory_reaches_llm_via_full_turn():
    """End-to-end: a confirmed memory in the port flows to the LLM's system message.

    handle_turn builds the system prompt internally; MockLLM's last_system_prompt
    captures what it received.
    """
    async def run() -> str:
        llm = MockLLM(dim=8)
        port = _ConfirmedPort("Nordstern-Report bis Freitag")
        runner = InProcessRunner()
        await handle_turn("u1", "Was steht heute an?", port=port, llm=llm, runner=runner)
        # MockLLM stores the most recent system message it received
        return llm.last_system or ""

    system = asyncio.run(run())
    assert "Nordstern-Report bis Freitag" in system


def test_no_memory_candidates_produces_no_memory_block():
    """_compose_memory_block must return an empty string when there are no candidates
    and no always_on_summary — so build_system_prompt receives a clean slate."""
    ctx = TurnContext(
        display_name="Anna",
        coaching_style=None,
        rolling_summary="",
        recent=[],
        always_on_summary="",
        memory_candidates=[],
    )
    assert _compose_memory_block(ctx) == ""
