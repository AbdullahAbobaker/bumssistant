"""DB-backed ChatPort — the persistence spine behind the chat loop (DECISIONS.md #17).

Implements app.chat.orchestrator.ChatPort against Postgres (+ pgvector):
  - load_context      : rolling summary + recent turns + always-on core + hybrid candidates
  - log_message       : append to the user's single persistent thread
  - extract_memories  : async learn-step (v1 stub — AI inference is Decision #8, separate)

Each method opens its OWN short-lived session from a session_factory. That matters:
extract_memories runs fire-and-forget AFTER the request returns, by which point the
request-scoped session is already closed — a self-owned session keeps it safe.

The pure helpers below (normalize_keyword_ranks, compose_always_on, prior_turns,
row_to_candidate) carry the logic worth trusting and are unit-tested without a DB;
the SQL itself is exercised through the running app.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.chat.orchestrator import TurnContext
from app.chat.session import WINDOW_TURNS, Msg
from app.llm import LLMClient
from app.memory.extraction import clamp_confidence, dedupe, filter_candidates
from app.memory.retrieval import Candidate

CANDIDATE_FETCH_LIMIT = 20  # bounded set handed to the pure score-fusion ranker


# --- pure helpers (unit-tested, no DB) --------------------------------------
def normalize_keyword_ranks(raw: Sequence[float]) -> list[float]:
    """ts_rank is unbounded; scale to 0..1 relative to the batch max so it can feed
    the score-fusion weights. All-zero (no keyword hits) stays all-zero."""
    hi = max(raw, default=0.0)
    if hi <= 0.0:
        return [0.0 for _ in raw]
    return [max(r, 0.0) / hi for r in raw]


def compose_always_on(active_projects: Sequence[str], due_titles: Sequence[str]) -> str:
    """The always-on core line: active projects + tasks due/overdue. Empty -> ''."""
    parts: list[str] = []
    if active_projects:
        parts.append("Aktive Projekte: " + ", ".join(active_projects) + ".")
    if due_titles:
        parts.append("Heute fällig/überfällig: " + ", ".join(due_titles) + ".")
    return " ".join(parts)


def prior_turns(rows_newest_first: Sequence[Any]) -> list[Msg]:
    """Drop the just-logged incoming message (the newest row, logged before load_context)
    and return the prior turns in chronological order for the context window."""
    prior = list(rows_newest_first[1:])   # [0] is the incoming turn — exclude it
    prior.reverse()
    return [Msg(r.role, r.content) for r in prior]


def row_to_candidate(row: Any, keyword_rank: float) -> Candidate:
    """Map a memories row (+ its normalized keyword rank) onto a scoring Candidate."""
    return Candidate(
        id=str(row.id),
        title=row.title,
        semantic_sim=float(row.semantic_sim or 0.0),
        keyword_rank=keyword_rank,
        age_days=float(row.age_days or 0.0),
        importance=float(row.importance or 0.0),
        confidence=float(row.confidence or 0.0),
        scope_match=1.0,
        superseded=bool(row.superseded),
        expired=bool(row.expired),
    )


# --- user resolution --------------------------------------------------------
async def get_or_create_user(session: AsyncSession, user: CurrentUser) -> str:
    """Upsert the authenticated principal (Entra oid or dev bypass) and return the
    internal users.id — the string user_id the whole chat loop keys on."""
    row = (
        await session.execute(
            text(
                """
                INSERT INTO users (entra_oid, email, display_name)
                VALUES (:oid, :email, :name)
                ON CONFLICT (entra_oid)
                DO UPDATE SET email = EXCLUDED.email,
                             display_name = EXCLUDED.display_name
                RETURNING id
                """
            ),
            {"oid": user.entra_oid, "email": user.email, "name": user.display_name},
        )
    ).one()
    await session.commit()
    return str(row.id)


# --- the port ---------------------------------------------------------------
class DbChatPort:
    """Postgres-backed ChatPort. `session_factory` is app.db.SessionLocal."""

    def __init__(self, session_factory: Callable[[], AsyncSession], llm: LLMClient) -> None:
        self._sf = session_factory
        self._llm = llm

    async def load_context(self, user_id: str, user_text: str) -> TurnContext:
        embedding = await self._llm.embed(user_text)
        qvec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"

        async with self._sf() as s:
            urow = (
                await s.execute(
                    text("SELECT display_name FROM users WHERE id = :uid"),
                    {"uid": user_id},
                )
            ).first()
            display_name = urow.display_name if urow and urow.display_name else ""

            # Coaching style lives as a confirmed comm_style memory (onboarding target).
            crow = (
                await s.execute(
                    text(
                        """
                        SELECT title FROM memories
                        WHERE user_id = :uid AND type = 'comm_style' AND status = 'confirmed'
                        ORDER BY updated_at DESC LIMIT 1
                        """
                    ),
                    {"uid": user_id},
                )
            ).first()
            coaching_style = crow.title if crow else None

            # Persistent thread: rolling summary + the tail of recent turns.
            conv = (
                await s.execute(
                    text("SELECT id, rolling_summary FROM conversations WHERE user_id = :uid"),
                    {"uid": user_id},
                )
            ).first()
            rolling_summary = conv.rolling_summary if conv else ""
            recent: list[Msg] = []
            if conv:
                keep = WINDOW_TURNS * 2
                rows = (
                    await s.execute(
                        text(
                            """
                            SELECT role, content FROM messages
                            WHERE conversation_id = :cid
                            ORDER BY created_at DESC
                            LIMIT :lim
                            """
                        ),
                        {"cid": conv.id, "lim": keep + 1},  # +1: the incoming turn we then drop
                    )
                ).all()
                recent = prior_turns(rows)

            # Always-on core: active projects + tasks due/overdue.
            projs = (
                await s.execute(
                    text(
                        """
                        SELECT name FROM projects
                        WHERE user_id = :uid AND status = 'active'
                        ORDER BY updated_at DESC LIMIT 5
                        """
                    ),
                    {"uid": user_id},
                )
            ).all()
            dues = (
                await s.execute(
                    text(
                        """
                        SELECT title FROM memories
                        WHERE user_id = :uid AND type = 'task' AND status = 'confirmed'
                          AND due_at IS NOT NULL AND due_at <= now()
                          AND (state IS NULL OR state <> 'done')
                        ORDER BY due_at ASC LIMIT 5
                        """
                    ),
                    {"uid": user_id},
                )
            ).all()
            always_on = compose_always_on([p.name for p in projs], [d.title for d in dues])

            # Hybrid recall: vector top-N (primary), ts_rank as a scoring feature.
            crows = (
                await s.execute(
                    text(
                        """
                        SELECT id, title,
                               COALESCE(1 - (embedding <=> CAST(:qvec AS vector)), 0) AS semantic_sim,
                               ts_rank(search_tsv, plainto_tsquery('german', :q)) AS kw_raw,
                               EXTRACT(EPOCH FROM (now() - COALESCE(last_referenced_at, updated_at)))
                                   / 86400.0 AS age_days,
                               importance, confidence,
                               (superseded_by IS NOT NULL) AS superseded,
                               (valid_until IS NOT NULL AND valid_until < now()) AS expired
                        FROM memories
                        WHERE user_id = :uid AND status = 'confirmed'
                        ORDER BY embedding <=> CAST(:qvec AS vector)
                        LIMIT :lim
                        """
                    ),
                    {"uid": user_id, "qvec": qvec, "q": user_text, "lim": CANDIDATE_FETCH_LIMIT},
                )
            ).all()
            kw = normalize_keyword_ranks([float(r.kw_raw or 0.0) for r in crows])
            candidates = [row_to_candidate(r, kw[i]) for i, r in enumerate(crows)]

        return TurnContext(
            display_name=display_name,
            coaching_style=coaching_style,
            rolling_summary=rolling_summary or "",
            recent=recent,
            always_on_summary=always_on,
            memory_candidates=candidates,
        )

    async def log_message(self, user_id: str, role: str, content: str) -> None:
        async with self._sf() as s:
            conv = (
                await s.execute(
                    text(
                        """
                        INSERT INTO conversations (user_id) VALUES (:uid)
                        ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
                        RETURNING id
                        """
                    ),
                    {"uid": user_id},
                )
            ).one()
            await s.execute(
                text(
                    """
                    INSERT INTO messages (conversation_id, user_id, role, content)
                    VALUES (:cid, :uid, CAST(:role AS message_role), :content)
                    """
                ),
                {"cid": conv.id, "uid": user_id, "role": role, "content": content},
            )
            await s.commit()

    async def extract_memories(self, user_id: str, user_text: str, reply: str) -> None:
        """Async learn-step (#17): infer task/pattern candidates from the turn, drop
        health/mental-state (#10) and duplicates, and persist them as proposed/ai_inferred (#8)
        for the user to confirm. Best-effort — extraction never crashes the background task."""
        try:
            candidates = filter_candidates(await self._llm.extract(user_text, reply))
            if not candidates:
                return
            async with self._sf() as s:
                rows = (
                    await s.execute(
                        text(
                            """
                            SELECT lower(title) AS t FROM memories
                            WHERE user_id = :uid AND type IN ('task', 'pattern')
                              AND status IN ('proposed', 'confirmed')
                            """
                        ),
                        {"uid": user_id},
                    )
                ).all()
                existing = {r.t for r in rows}
                for c in dedupe(candidates, existing):
                    embedding = await self._llm.embed(f"{c.title} {c.note}".strip())
                    qvec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
                    await s.execute(
                        text(
                            """
                            INSERT INTO memories (user_id, type, title, note, source,
                                                  confidence, status, embedding)
                            VALUES (:uid, CAST(:type AS memory_type), :title, :note,
                                    'ai_inferred', :confidence, 'proposed', CAST(:qvec AS vector))
                            """
                        ),
                        {
                            "uid": user_id,
                            "type": c.type,
                            "title": c.title,
                            "note": c.note,
                            "confidence": clamp_confidence(c.confidence),
                            "qvec": qvec,
                        },
                    )
                await s.commit()
        except Exception:
            # Best-effort: the reply already went out; a failed learn-step must stay silent.
            return None
