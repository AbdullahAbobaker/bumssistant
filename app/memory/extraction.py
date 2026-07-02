"""Pure memory-extraction helpers (Decision #17 write step; #8; #10).

Filtering/dedup/confidence logic lives here as pure functions so it's DB-free unit-testable;
the LLM call (LLMClient.extract) and the DB write (DbChatPort.extract_memories) live elsewhere.
"""
from __future__ import annotations

from app.llm import MemoryCandidate

ALLOWED_TYPES = {"task", "pattern"}

# Health/mental-state deny-list (Decision #10): AI-inferred memories mentioning these are never
# stored. Conservative, case-insensitive substring match. (The user's own stress_triggers via
# onboarding is a separate user_explicit path, not this AI path.)
HEALTH_DENYLIST: tuple[str, ...] = (
    "krank", "krankheit", "depress", "burnout", "angst", "panik", "therapie",
    "diagnose", "medikament", "suizid", "mental health", "psych",
)


def filter_candidates(cands: list[MemoryCandidate]) -> list[MemoryCandidate]:
    """Keep only allowed types with a non-empty (stripped) title; drop anything whose title+note
    matches the health/mental-state deny-list. Returns candidates with stripped titles."""
    kept: list[MemoryCandidate] = []
    for c in cands:
        if c.type not in ALLOWED_TYPES:
            continue
        title = c.title.strip()
        if not title:
            continue
        blob = f"{title} {c.note or ''}".lower()
        if any(term in blob for term in HEALTH_DENYLIST):
            continue
        kept.append(MemoryCandidate(type=c.type, title=title, note=c.note, confidence=c.confidence))
    return kept


def dedupe(cands: list[MemoryCandidate], existing_titles: set[str]) -> list[MemoryCandidate]:
    """Drop candidates whose normalized (stripped/lowercased) title already exists, or repeats
    earlier in this batch. `existing_titles` must already be lowercased."""
    seen = set(existing_titles)
    kept: list[MemoryCandidate] = []
    for c in cands:
        key = c.title.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        kept.append(c)
    return kept


def clamp_confidence(c: float) -> float:
    """Clamp to [0.0, 1.0]."""
    return max(0.0, min(1.0, c))
