# Design: Async memory extraction

**Date:** 2026-07-02
**Status:** Approved (brainstorming) — ready for implementation plan
**Relates to:** Decision #17 (working memory / async write step — "reply first, learn second"),
#8 (propose-then-confirm), #10 (no health/mental-state storage), #14 (guardrails),
#18 (LLMClient gateway), #16 (embeddings for recall).

## Goal

Fill the `extract_memories` no-op stub so BumFlow actually *learns*: after each turn, infer
candidate memories from `(user_text, reply)` and persist them as `status='proposed'`,
`source='ai_inferred'` for later user confirmation. This completes the write half of the chat
loop; the confirm UI (batched review panel) is separate/future.

## Scope decisions (settled in brainstorming)

- **v1 extracts `task` + `pattern` only** — the two highest-signal, most-detectable kinds.
  `blocker`/`decision`/`comm_style` deferred.
- **New `LLMClient.extract()` method** — keeps the extraction prompt + JSON parsing behind the
  Langdock seam (#18); `MockLLM.extract` gives deterministic candidates offline/in tests,
  independent of `chat`.
- **Guardrail #10 = prompt instruction + pure deny-list filter** (defense in depth; LLM-only
  filtering is unreliable). Drops *AI-inferred* health/mental-state; the user's own
  `stress_triggers` via onboarding (`user_explicit`) is a separate, permitted path.
- **Dedup = exact normalized-title match** for v1; semantic/embedding dedup deferred.
- **Everything lands `proposed`** → the user confirms regardless, so confidence is advisory.

## Architecture

### 1. Types + interface (`app/llm.py`)

```python
@dataclass
class MemoryCandidate:
    type: str            # "task" | "pattern"
    title: str
    note: str = ""
    confidence: float = 0.6
```

`LLMClient` protocol gains:
```python
async def extract(self, user_text: str, reply: str) -> list[MemoryCandidate]: ...
```

- **`MockLLM.extract`** — deterministic. If `user_text` (lowercased) contains a task trigger
  (`"muss"`, `"todo"`, `"aufgabe"`, `"task"`) it returns one `task` candidate whose title is a
  trimmed slice of `user_text`; otherwise `[]`. An `extract_script: list[list[MemoryCandidate]] |
  None` ctor arg, when set, pops the next scripted result per call (exact test sequences).
- **`LangdockLLM.extract`** — real: `_build_extract_payload(user_text, reply)` (system prompt:
  "extract only task/pattern action-items/work-patterns as JSON `[{type,title,note}]`; NEVER
  extract health, illness, or mental-state information; empty array if nothing") → POST → 
  `_parse_candidates(data)` (JSON → `MemoryCandidate`s; malformed/absent → `[]`). Both helpers
  pure/network-free.

### 2. Pure extractor (`app/memory/extraction.py`) — DB-free unit-tested

```python
ALLOWED_TYPES = {"task", "pattern"}
# Health/mental-state deny-list (Decision #10). Conservative, case-insensitive substring match.
HEALTH_DENYLIST = (
    "krank", "krankheit", "depress", "burnout", "angst", "panik", "therapie",
    "diagnose", "medikament", "suizid", "mental health", "psych",
)

def filter_candidates(cands: list[MemoryCandidate]) -> list[MemoryCandidate]:
    """Keep only allowed types with a non-empty title; drop anything whose title+note matches
    the health/mental-state deny-list (#10)."""

def dedupe(cands: list[MemoryCandidate], existing_titles: set[str]) -> list[MemoryCandidate]:
    """Drop candidates whose case-insensitive/stripped title already exists. v1 = exact match."""

def clamp_confidence(c: float) -> float:
    """Clamp to [0.0, 1.0]."""
```

`filter_candidates` also normalizes: strip title; skip if empty after strip. `existing_titles`
is normalized (lowercased/stripped) by the caller before `dedupe`.

### 3. `DbChatPort.extract_memories` body (`app/chat/repository.py`)

```
candidates = await self._llm.extract(user_text, reply)
candidates = filter_candidates(candidates)          # type + guardrail
if not candidates: return
async with session:
    rows = SELECT lower(title) FROM memories
           WHERE user_id=:uid AND type IN ('task','pattern')
             AND status IN ('proposed','confirmed')
    existing = { normalized titles }
    for c in dedupe(candidates, existing):
        emb = await self._llm.embed(f"{c.title} {c.note}".strip())
        INSERT memories(user_id, type, title, note, source='ai_inferred',
                        confidence=clamp_confidence(c.confidence), status='proposed',
                        embedding=CAST(:qvec AS vector))
    commit
```

SQL is not unit-tested (mirrors the rest of `DbChatPort`); the pure filter/dedupe/clamp logic
is. Runs in the existing fire-and-forget path with its own session — safe after the request
closes.

## Data flow

1. `handle_turn` replies, then `runner.run_later(port.extract_memories(user_id, user_text, reply))`
   (already wired, #17).
2. `extract_memories` → `llm.extract` → `filter_candidates` (type + #10 deny-list) → fetch
   existing titles → `dedupe` → embed → INSERT `proposed`/`ai_inferred`.
3. Proposals sit inert until the user confirms them (future batched review panel, #8/#17).

## Error handling

- Extraction is best-effort and off the reply path: any exception (LLM error, parse failure) is
  caught and logged, never surfaced to the user (the reply already went out). `_parse_candidates`
  returns `[]` on malformed output rather than raising.
- No candidates / all filtered / all duplicates → no-op (no INSERT).

## Testing (all pure, DB-free — CLAUDE.md bar)

1. `filter_candidates`: drops disallowed types (`blocker`), empty/whitespace titles, and
   health/mental-state matches (e.g. a candidate mentioning "Burnout" is dropped); keeps a clean
   `task`/`pattern`.
2. `dedupe`: drops a candidate whose title equals an existing title case-insensitively; keeps new.
3. `clamp_confidence`: `-1→0.0`, `2→1.0`, `0.6→0.6`.
4. `MockLLM.extract`: task trigger → one task candidate; no trigger → `[]`; `extract_script`
   drives an exact sequence.
5. `LangdockLLM._parse_candidates`: valid JSON → candidates; malformed/missing → `[]`.
   `_build_extract_payload` includes the health/mental-state prohibition in the system prompt.
6. `MemoryCandidate` construction/defaults.

## Out of scope

- `blocker`/`decision`/`comm_style` extraction; semantic/embedding dedup.
- The batched review/confirm UI (#17) and re-summarization of the rolling window.
- Superseding/merging evolving memories (#8 `superseded_by`).
