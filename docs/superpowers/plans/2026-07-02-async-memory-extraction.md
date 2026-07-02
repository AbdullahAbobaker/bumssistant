# Async Memory Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `extract_memories` no-op so BumFlow infers `task`/`pattern` candidates from each turn and persists them as `proposed`/`ai_inferred` for the user to confirm.

**Architecture:** New `LLMClient.extract()` (deterministic `MockLLM`, real `LangdockLLM` via pure helpers) returns `MemoryCandidate`s; a pure `app/memory/extraction.py` filters (type + health/mental-state deny-list, #10) and dedupes; `DbChatPort.extract_memories` wires extract → filter → dedupe → embed → INSERT. Runs in the existing fire-and-forget path (#17).

**Tech Stack:** Python 3.12, Pydantic/dataclasses, SQLAlchemy async, httpx, pytest.

## Global Constraints

- Python 3.10+; `from __future__ import annotations`.
- Reliability bar (CLAUDE.md): pure DB-free unit tests. Test interpreter: `/Applications/anaconda3/bin/python`; run `python -m pytest -q`.
- v1 extracts `task` + `pattern` ONLY. Everything lands `status='proposed'`, `source='ai_inferred'` (#8).
- **Decision #10:** NEVER store health/mental-state — enforced by BOTH the extraction prompt AND a pure deny-list filter.
- LLMClient is the only Langdock seam (#5/#18). Must run fully offline with `MockLLM`.
- Baseline: **42 tests passing**.
- **Sequencing note:** `LLMClient.extract` is added to the Protocol in Task 1 and implemented on `MockLLM` there; `LangdockLLM.extract` is added in Task 3. This is green in between because `typing.Protocol` isn't runtime-enforced and `LangdockLLM` is never instantiated in dev/tests (`get_llm` returns `MockLLM`).

---

### Task 1: `MemoryCandidate` + `LLMClient.extract` protocol + `MockLLM.extract`

**Files:**
- Modify: `app/llm.py` (add `MemoryCandidate`; add `extract` to `LLMClient`; add `extract_script` ctor arg + `extract` to `MockLLM`)
- Test: `tests/test_llm_extract.py` (create)

**Interfaces:**
- Produces: `MemoryCandidate(type: str, title: str, note: str = "", confidence: float = 0.6)`; `LLMClient.extract(user_text, reply) -> list[MemoryCandidate]`; `MockLLM(embedding_dim=1536, script=None, extract_script=None)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_llm_extract.py`:
```python
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
    assert "Nordstern-Report" in got[0].title
    # no trigger word -> nothing extracted
    assert asyncio.run(m.extract("Schönes Wetter heute", "ok")) == []


def test_mockllm_extract_script_drives_sequence():
    scripted = [MemoryCandidate(type="pattern", title="Plant morgens")]
    m = MockLLM(8, extract_script=[scripted, []])
    assert asyncio.run(m.extract("x", "y"))[0].title == "Plant morgens"
    assert asyncio.run(m.extract("x", "y")) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_llm_extract.py -q`
Expected: FAIL — `ImportError: cannot import name 'MemoryCandidate'`

- [ ] **Step 3: Write minimal implementation**

In `app/llm.py`, add the dataclass after `ChatMessage` (after line 39):
```python
@dataclass
class MemoryCandidate:
    type: str            # "task" | "pattern"
    title: str
    note: str = ""
    confidence: float = 0.6
```
Add `extract` to the `LLMClient` protocol (after the `embed` line):
```python
    async def embed(self, text: str) -> list[float]: ...
    async def extract(self, user_text: str, reply: str) -> list["MemoryCandidate"]: ...
```
Add a module-level constant just above `class MockLLM`:
```python
_TASK_TRIGGERS = ("muss", "todo", "aufgabe", "task")
```
Change `MockLLM.__init__` to accept `extract_script`:
```python
    def __init__(
        self,
        embedding_dim: int = 1536,
        script: list["ChatResult"] | None = None,
        extract_script: list[list["MemoryCandidate"]] | None = None,
    ) -> None:
        self._dim = embedding_dim
        self._script = list(script) if script is not None else None
        self._extract_script = list(extract_script) if extract_script is not None else None
```
Add `MockLLM.extract` (after `embed`):
```python
    async def extract(self, user_text: str, reply: str) -> list[MemoryCandidate]:
        if self._extract_script is not None:
            return self._extract_script.pop(0)
        low = (user_text or "").lower()
        if any(t in low for t in _TASK_TRIGGERS):
            return [MemoryCandidate(type="task", title=user_text.strip()[:80])]
        return []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — baseline 42 + 3 → 45; `LangdockLLM` has no `extract` yet, which is fine: it's never instantiated in tests)

- [ ] **Step 5: Commit**

```bash
git add app/llm.py tests/test_llm_extract.py
git commit -m "feat(llm): MemoryCandidate + LLMClient.extract + deterministic MockLLM.extract"
```

---

### Task 2: Pure extractor module

**Files:**
- Create: `app/memory/extraction.py`
- Test: `tests/test_extraction.py` (create)

**Interfaces:**
- Consumes: `MemoryCandidate` (Task 1).
- Produces: `ALLOWED_TYPES: set[str]`; `HEALTH_DENYLIST: tuple[str, ...]`; `filter_candidates(cands) -> list[MemoryCandidate]`; `dedupe(cands, existing_titles: set[str]) -> list[MemoryCandidate]`; `clamp_confidence(c: float) -> float`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_extraction.py`:
```python
"""Pure, DB-free tests for the memory extractor (app/memory/extraction.py)."""
from app.llm import MemoryCandidate
from app.memory.extraction import clamp_confidence, dedupe, filter_candidates


def test_filter_keeps_allowed_types_with_titles():
    kept = filter_candidates([
        MemoryCandidate(type="task", title="  Report schreiben  "),   # kept + title stripped
        MemoryCandidate(type="pattern", title="Plant morgens"),       # kept
        MemoryCandidate(type="blocker", title="Warten auf X"),        # wrong type -> dropped
        MemoryCandidate(type="task", title="   "),                    # empty after strip -> dropped
    ])
    assert [(c.type, c.title) for c in kept] == [
        ("task", "Report schreiben"), ("pattern", "Plant morgens")
    ]


def test_filter_drops_health_and_mental_state():
    kept = filter_candidates([
        MemoryCandidate(type="pattern", title="Hat Burnout-Symptome"),        # deny-list
        MemoryCandidate(type="task", title="Termin", note="wegen Depression"),  # deny-list in note
        MemoryCandidate(type="task", title="Report schreiben"),                # clean -> kept
    ])
    assert [c.title for c in kept] == ["Report schreiben"]


def test_dedupe_drops_existing_and_intra_batch():
    existing = {"report schreiben"}
    kept = dedupe([
        MemoryCandidate(type="task", title="Report schreiben"),   # matches existing (case-insens)
        MemoryCandidate(type="task", title="Neue Aufgabe"),       # new
        MemoryCandidate(type="task", title="neue aufgabe"),       # dup within batch
    ], existing)
    assert [c.title for c in kept] == ["Neue Aufgabe"]


def test_clamp_confidence():
    assert clamp_confidence(-1.0) == 0.0
    assert clamp_confidence(2.0) == 1.0
    assert clamp_confidence(0.6) == 0.6
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_extraction.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.memory.extraction'`

- [ ] **Step 3: Write minimal implementation**

Create `app/memory/extraction.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — 45 + 4 → 49)

- [ ] **Step 5: Commit**

```bash
git add app/memory/extraction.py tests/test_extraction.py
git commit -m "feat(memory): pure extraction filter/dedupe/clamp (type + health deny-list)"
```

---

### Task 3: `LangdockLLM.extract` + pure helpers

**Files:**
- Modify: `app/llm.py` (add `_build_extract_payload`, `_parse_candidates`, `LangdockLLM.extract`)
- Test: `tests/test_llm_extract.py` (add)

**Interfaces:**
- Consumes: `MemoryCandidate`, `ChatMessage` (`app/llm.py`).
- Produces: module funcs `_build_extract_payload(user_text, reply) -> dict`, `_parse_candidates(data: dict) -> list[MemoryCandidate]`; `LangdockLLM.extract`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_llm_extract.py`:
```python
from app.llm import _build_extract_payload, _parse_candidates


def test_build_extract_payload_forbids_health_and_asks_json():
    p = _build_extract_payload("Ich muss X tun", "ok")
    sys = p["messages"][0]["content"].lower()
    assert "json" in sys
    assert "health" in sys or "mental" in sys or "gesundheit" in sys  # #10 prohibition present
    # the turn is included for the model to extract from
    joined = " ".join(m["content"] for m in p["messages"])
    assert "Ich muss X tun" in joined


def test_parse_candidates_valid_and_malformed():
    data = {"choices": [{"message": {"content":
        '[{"type":"task","title":"Report","note":"bis Fr"},{"type":"pattern","title":"Morgens"}]'
    }}]}
    got = _parse_candidates(data)
    assert [(c.type, c.title) for c in got] == [("task", "Report"), ("pattern", "Morgens")]
    # malformed / non-JSON content -> [] (never raises)
    assert _parse_candidates({"choices": [{"message": {"content": "sorry, none"}}]}) == []
    assert _parse_candidates({"choices": [{"message": {"content": None}}]}) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Applications/anaconda3/bin/python -m pytest tests/test_llm_extract.py -q`
Expected: FAIL — `ImportError: cannot import name '_build_extract_payload'`

- [ ] **Step 3: Write minimal implementation**

In `app/llm.py`, add two module-level functions just above `class LangdockLLM`:
```python
_EXTRACT_SYSTEM = (
    "Extrahiere aus dem folgenden Gespräch NUR konkrete Aufgaben (type 'task') und "
    "Arbeitsmuster (type 'pattern') der Person. Antworte AUSSCHLIESSLICH mit einem JSON-Array "
    "von Objekten {\"type\": \"task\"|\"pattern\", \"title\": string, \"note\": string}. "
    "Extrahiere NIEMALS Gesundheits-, Krankheits- oder mentale/psychische Informationen "
    "(no health, illness, or mental-state information). Nichts gefunden -> leeres Array []."
)


def _build_extract_payload(user_text: str, reply: str) -> dict:
    """OpenAI-compatible payload asking for a JSON array of task/pattern candidates."""
    return {
        "model": "claude-sonnet-5",
        "messages": [
            {"role": "system", "content": _EXTRACT_SYSTEM},
            {"role": "user", "content": f"Nutzer: {user_text}\nAssistent: {reply}"},
        ],
    }


def _parse_candidates(data: dict) -> list[MemoryCandidate]:
    """Parse the model's JSON array into MemoryCandidates. Malformed/absent -> [] (never raises)."""
    content = data["choices"][0]["message"].get("content")
    if not content:
        return []
    try:
        items = json.loads(content)
    except (ValueError, TypeError):
        return []
    if not isinstance(items, list):
        return []
    out: list[MemoryCandidate] = []
    for it in items:
        if isinstance(it, dict) and it.get("type") and it.get("title"):
            out.append(MemoryCandidate(
                type=str(it["type"]),
                title=str(it["title"]),
                note=str(it.get("note") or ""),
                confidence=float(it.get("confidence", 0.6)),
            ))
    return out
```
Add `LangdockLLM.extract` (after its `embed` method):
```python
    async def extract(self, user_text: str, reply: str) -> list[MemoryCandidate]:
        payload = _build_extract_payload(user_text, reply)
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{self._base}/v1/chat/completions", json=payload, headers=self._headers
            )
            r.raise_for_status()
            return _parse_candidates(r.json())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — 49 + 2 → 51)

- [ ] **Step 5: Commit**

```bash
git add app/llm.py tests/test_llm_extract.py
git commit -m "feat(llm): LangdockLLM.extract via pure _build_extract_payload/_parse_candidates"
```

---

### Task 4: Wire `DbChatPort.extract_memories`

**Files:**
- Modify: `app/chat/repository.py` (imports + `extract_memories` body at ~line 250)

**Interfaces:**
- Consumes: `MemoryCandidate` via `self._llm.extract`; `filter_candidates`, `dedupe`, `clamp_confidence` (Task 2). Uses `self._sf` (session factory) and `self._llm` already on `DbChatPort`.

**NOTE — integration task.** The SQL is not unit-tested (mirrors the rest of `DbChatPort`, whose `load_context`/`log_message` SQL is exercised via the running app). Verified by import + the full suite staying green + a live smoke (documented). The pure logic it calls is already tested in Tasks 1–3.

- [ ] **Step 1: Add the import**

In `app/chat/repository.py`, add near the other `from app.*` imports (top of file):
```python
from app.memory.extraction import clamp_confidence, dedupe, filter_candidates
```

- [ ] **Step 2: Replace the stub body**

Replace the current `extract_memories` method (the `"""v1 stub. …"""` docstring + `return None`) with:
```python
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
```

- [ ] **Step 3: Verify import + full suite**

Run: `/Applications/anaconda3/bin/python -c "import app.main; print('import ok')"`
Expected: `import ok`
Run: `/Applications/anaconda3/bin/python -m pytest -q`
Expected: PASS (all — still 51; no new pytest, this is integration wiring)

- [ ] **Step 4: Commit**

```bash
git add app/chat/repository.py
git commit -m "feat(chat): wire extract_memories -> proposed ai_inferred task/pattern (#17)"
```

---

## Final verification

- [ ] `/Applications/anaconda3/bin/python -m pytest -q` — all green (was 42; +~9 → 51).
- [ ] `/Applications/anaconda3/bin/python -c "import app.main; print('ok')"` — clean.
- [ ] (Optional, needs DB + server) live smoke: POST /chat with a task-trigger message ("Ich muss den Report schreiben"), then confirm a `proposed`/`ai_inferred` task row appears for the dev user.

## Spec coverage map

| Spec section | Task |
|---|---|
| §1 MemoryCandidate + LLMClient.extract + MockLLM.extract | 1 |
| §1 LangdockLLM.extract + _build_extract_payload/_parse_candidates | 3 |
| §2 pure extractor (filter_candidates/dedupe/clamp_confidence, deny-list) | 2 |
| §3 DbChatPort.extract_memories body (best-effort, proposed/ai_inferred) | 4 |
| Error handling (best-effort try/except; _parse_candidates never raises) | 3, 4 |
| Testing (6 groups, DB-free) | 1 (candidate/mock), 2 (filter/dedupe/clamp), 3 (langdock helpers) |
