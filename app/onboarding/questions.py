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


@dataclass(frozen=True)
class MemoryWrite:
    """One memory row an onboarding answer becomes (parsed from the question's target)."""

    type: str                 # memory_type enum value
    title: str
    detail_kind: str | None   # details->'kind' (e.g. 'goal', 'stress_trigger')


def _question(key: str) -> ColdQuestion | None:
    return next((q for q in COLD_QUESTIONS if q.key == key), None)


def validate_answer(key: str, value: str) -> str | None:
    """Error message for one incremental wizard answer, or None if it may be saved."""
    q = _question(key)
    if q is None:
        return f"Unbekannte Frage: {key}"
    val = value.strip()
    if not val:
        return f"Leere Antwort: {key}"
    if q.kind == "choice" and val not in q.options:
        return f"Ungültige Antwort für {key}: {val}"
    return None


def answer_to_write(key: str, value: str) -> MemoryWrite | None:
    """Map one answer onto its memory write via the question's target ('type' or
    'type:kind'). Unknown keys and blank values produce nothing."""
    q = _question(key)
    val = value.strip()
    if q is None or not val:
        return None
    mtype, _, kind = q.target.partition(":")
    return MemoryWrite(type=mtype, title=val, detail_kind=kind or None)
