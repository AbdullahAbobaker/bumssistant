"""Read-time memory retrieval (DECISIONS.md #16).

Pipeline per turn:
  1. ALWAYS-ON core   -> metadata query (coaching_style, active projects, tasks due/overdue)
  2. Candidate fetch  -> vector top-N  UNION  full-text top-N   (fetch_candidates, DB layer)
  3. Score fusion     -> weighted(relevance, keyword, recency, importance, scope) * confidence
  4. Filter + select  -> drop stale/superseded, take top 3..8 within token budget

v1 uses deterministic score-fusion — NO separate reranker model (see DECISIONS #16).
The scoring/selection below are pure functions so they're unit-testable without a DB.
"""
from __future__ import annotations

from dataclasses import dataclass

# Weights sum to 1.0; tune with real data before adding a model-based reranker.
DEFAULT_WEIGHTS = {
    "semantic": 0.40,
    "keyword": 0.20,
    "recency": 0.15,
    "importance": 0.15,
    "scope": 0.10,
}

RECENCY_HALF_LIFE_DAYS = 30.0
K_MIN, K_MAX = 3, 8


@dataclass
class Candidate:
    id: str
    title: str
    semantic_sim: float      # 0..1  (1 - cosine distance)
    keyword_rank: float      # 0..1  (normalized ts_rank)
    age_days: float          # since last_referenced_at / updated_at
    importance: float        # 0..1
    confidence: float        # 0..1
    scope_match: float = 1.0 # 1.0 same user/project; lower for broader-scope team priors
    superseded: bool = False # superseded_by IS NOT NULL
    expired: bool = False    # valid_until < now()


def recency_score(age_days: float, half_life: float = RECENCY_HALF_LIFE_DAYS) -> float:
    """Exponential decay: fresh ~1.0, one half-life ~0.5. Stale memory ranks lower."""
    return 0.5 ** (max(age_days, 0.0) / half_life)


def score(c: Candidate, weights: dict[str, float] = DEFAULT_WEIGHTS) -> float:
    """Weighted fusion, scaled by confidence so shaky memories sink."""
    base = (
        weights["semantic"] * c.semantic_sim
        + weights["keyword"] * c.keyword_rank
        + weights["recency"] * recency_score(c.age_days)
        + weights["importance"] * c.importance
        + weights["scope"] * c.scope_match
    )
    return base * c.confidence


def select_for_context(
    candidates: list[Candidate],
    k_min: int = K_MIN,
    k_max: int = K_MAX,
    min_score: float = 0.15,
) -> list[Candidate]:
    """Filter unusable memories, rank by fused score, inject top 3..8.

    Filtering aggressively (few, highly-relevant) beats stuffing many marginal ones.
    """
    usable = [c for c in candidates if not c.superseded and not c.expired]
    ranked = sorted(usable, key=score, reverse=True)
    # Always keep at least k_min if we have them; beyond that require a score floor.
    head = ranked[:k_min]
    tail = [c for c in ranked[k_min:k_max] if score(c) >= min_score]
    return head + tail
