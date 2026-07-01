"""Onboarding definition — short + progressive (DECISIONS.md #13).

Two parts:
  1. REFLECTIONS — generated at runtime from warm-start inferences ("I noticed X, right?").
     The user confirms/edits; confirming flips the underlying memory proposed -> confirmed.
  2. COLD QUESTIONS — the handful of things no data can reveal. Defined statically here.

Everything except coaching_style is skippable. Answers map to memory writes via `target`.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ColdQuestion:
    key: str
    prompt: str
    kind: str            # "choice" | "text"
    required: bool
    target: str          # which memory this answer becomes (type[:detail])
    options: tuple[str, ...] = ()
    help_text: str = ""


COACHING_STYLES = (
    "Direkt & fordernd",       # push hard, hold me accountable
    "Warm & ermutigend",       # gentle, encouraging
    "Ausgewogen",              # balanced (default)
    "Nur die Fakten",          # minimal, no pep talk
)

COLD_QUESTIONS: tuple[ColdQuestion, ...] = (
    ColdQuestion(
        key="coaching_style",
        prompt="Wie soll BumFlow mit dir sprechen?",
        kind="choice",
        required=True,                       # mandatory: calibrates BumFlow's voice from msg 1
        target="comm_style:coaching_style",
        options=COACHING_STYLES,
        help_text="Bestimmt Tonfall und Nachdrücklichkeit. Jederzeit änderbar.",
    ),
    ColdQuestion(
        key="goals",
        prompt="Was sind deine wichtigsten Ziele in diesem Quartal?",
        kind="text",
        required=False,
        target="pattern:goal",               # v1: stored as goal-flagged pattern (see DECISIONS open item)
        help_text="Optional. Hilft BumFlow, Prioritäten zu erkennen.",
    ),
    ColdQuestion(
        key="stress_triggers",
        prompt="Was stresst dich oder bringt dich zum Aufschieben?",
        kind="text",
        required=False,
        target="pattern:stress_trigger",
        help_text="Optional. Damit BumFlow im richtigen Moment unterstützt statt nervt.",
    ),
)


def required_keys() -> list[str]:
    return [q.key for q in COLD_QUESTIONS if q.required]


def is_complete(answers: dict[str, str]) -> bool:
    """Onboarding is 'done' once every required question has a non-empty answer."""
    return all(answers.get(k) for k in required_keys())
