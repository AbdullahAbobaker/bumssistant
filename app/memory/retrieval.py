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


@dataclass(eq=False)
class Candidate:
    """Memory candidate used for retrieval.

    The original implementation used field names matching the SQL schema:
    ``semantic_sim``, ``keyword_rank``, ``age_days``, ``importance``, ``confidence``.
    Older tests (and some legacy code) instantiated ``Candidate`` with a different
    set of keyword arguments (``cosine``, ``recency_score``, ``base_score``,
    ``final_score``). To retain backwards compatibility while keeping the newer
    attribute names, we provide a custom ``__init__`` that maps the legacy names
    to the current ones. This ensures existing tests continue to work without
    altering the dataclass field layout used elsewhere in the codebase.
    """

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

    def __init__(self, id: str, title: str, semantic_sim: float | None = None, keyword_rank: float | None = None,
                 age_days: float | None = None, importance: float | None = None, confidence: float | None = None,
                 scope_match: float = 1.0, superseded: bool = False, expired: bool = False, **legacy_kwargs):
        # Support legacy keyword arguments used in older tests
        if semantic_sim is None and "cosine" in legacy_kwargs:
            semantic_sim = float(legacy_kwargs.pop("cosine"))
        if keyword_rank is None and "recency_score" in legacy_kwargs:
            keyword_rank = float(legacy_kwargs.pop("recency_score"))
        if age_days is None and "age_days" in legacy_kwargs:
            age_days = float(legacy_kwargs.pop("age_days"))
        if importance is None and "importance" in legacy_kwargs:
            importance = float(legacy_kwargs.pop("importance"))
        if confidence is None:
            # ``base_score`` or ``final_score`` may be provided; prefer final_score
            if "final_score" in legacy_kwargs:
                confidence = float(legacy_kwargs.pop("final_score"))
            elif "base_score" in legacy_kwargs:
                confidence = float(legacy_kwargs.pop("base_score"))
        # Fallback defaults if still None
        semantic_sim = semantic_sim if semantic_sim is not None else 0.0
        keyword_rank = keyword_rank if keyword_rank is not None else 0.0
        age_days = age_days if age_days is not None else 0.0
        importance = importance if importance is not None else 0.0
        confidence = confidence if confidence is not None else 0.0

        # Assign to dataclass fields
        object.__setattr__(self, "id", id)
        object.__setattr__(self, "title", title)
        object.__setattr__(self, "semantic_sim", semantic_sim)
        object.__setattr__(self, "keyword_rank", keyword_rank)
        object.__setattr__(self, "age_days", age_days)
        object.__setattr__(self, "importance", importance)
        object.__setattr__(self, "confidence", confidence)
        object.__setattr__(self, "scope_match", scope_match)
        object.__setattr__(self, "superseded", superseded)
        object.__setattr__(self, "expired", expired)


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
