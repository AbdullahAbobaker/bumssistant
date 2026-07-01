# Bumssistant — Decision Log

One sentence per decision. This is the shared memory of *why* the system is shaped
the way it is. Append; don't rewrite history.

## Locked

1. **Product** — Multi-user, DSGVO-compliant, EU-hosted AI work assistant with persistent
   per-user memory, self-configuring onboarding, a proactive engine, and Microsoft/Jira
   integrations. Coaching persona: **BumFlow** (direct, warm, anti-procrastination).
   First customer: the team at **Buben & Mädchen** (German company).

2. **Surface** — Web app first (full UX: chat, memory viewer, onboarding). Teams bot second,
   as a proactive-delivery channel. **One backend brain, thin clients.**

3. **Auth** — Microsoft **Entra ID SSO** ("Sign in with Microsoft"). Doubles as the OAuth
   foundation for Outlook/Calendar/Teams. Local dev uses a fail-closed bypass.

4. **Stack** — Backend: **Python + FastAPI** (coded, tested, versioned — reliable core).
   Frontend: **React + TypeScript**. Memory store: **Postgres + pgvector**.

5. **LLM gateway** — **Langdock** (Berlin, EU-hosted, DSGVO-compliant proxy to Claude/GPT +
   embeddings). Swapping models is a config change.

6. **n8n** — Demoted from "the system" to *optional* non-critical scheduling glue only.
   Never the memory, never the critical path.

7. **Memory model** — **Hybrid.** `projects` = first-class table. `memories` = five kinds
   (task, blocker, decision, pattern, comm_style) unified in one table with a freeform
   `note` + `embedding` + JSONB `details`, hot fields (`due_at`, `state`) promoted to columns.

8. **Memory write path** — **Propose-then-confirm.** High-confidence structured facts auto-save;
   fuzzy inferences land as `status='proposed'` for the user to confirm/correct. Every row
   carries provenance (`source`, `confidence`, `status`, timestamps, `superseded_by`).

9. **Anti-cold-start (warm start)** — 4 phases: (0) instant Entra profile seed; (1) background
   backfill scan; (2) onboarding = *reflect inferences back*, not cold interrogation;
   (3) shared team/org priors. All bootstrapped memories arrive as `proposed`.

10. **Warm-start scan level** — **subjects_only**: calendar/Jira metadata + email SUBJECTS only.
    Raw subjects are discarded after a style/pattern summary is derived. Real employee data is
    scanned **only in production**; any non-prod environment is forced to synthetic `mock`.

11. **Dev environment** — Runs on a private laptop via `docker compose up` (Postgres+pgvector)
    + dev-auth bypass + mock data. No real company/personal data ever touches a private device.

12. **Proactive engine** — Fixed slots, **context-gated + self-suppressing** (a touchpoint
    returns no message when there's nothing worth saying). Rules are **user-selected at
    onboarding** or **AI-suggested → user-confirmed** (`proactive_rules`, same propose-then-confirm
    gate as memory). **v1 content is INFORMATIONAL only**; coaching (confidence-gated) deferred.

13. **Onboarding** — Short + progressive, not a big wizard. = reflections on warm-start
    inferences + 3 cold questions. **coaching_style is mandatory** (calibrates BumFlow's voice);
    **goals + stress_triggers optional.** Memory keeps growing through use afterward.

14. **BumFlow persona** — One authored identity (`BUMFLOW_CORE`) + 4 swappable `TONE_MODIFIERS`
    keyed to coaching_style. Hard guardrails baked in: pressure the task not the person; no
    health/mental-state commentary; never state unconfirmed memory as fact; never invent
    tasks/deadlines; mirror user's language, default German. Test enforces tone-modifier coverage.

15. **Language** — Bilingual, **user-led, German default**. BumFlow mirrors the user's language;
    switches to English only if the user does. (Resolves the earlier flag.)

16. **Memory retrieval** — Per turn: always-on core (coaching_style + active projects + tasks
    due/overdue) + **hybrid candidate fetch** (vector top-N ∪ Postgres full-text top-N) →
    **weighted score-fusion** (semantic·.4 + keyword·.2 + recency·.15 + importance·.15 + scope·.1,
    ×confidence) → filter stale/superseded/expired → inject **top 3–8** in a token budget.
    **v1 = deterministic fusion, NO reranker model.** Deferred to v2: cross-encoder/LLM reranker,
    true BM25 (pg_search), graph traversal. Added cols: `importance`, `valid_until`, `search_tsv`.

17. **Working memory** — One **persistent thread per user** (`conversations` + `messages`).
    Messages logged immediately. Context = rolling summary of older turns + last N turns verbatim.
    Write step = **async per-turn extraction** (reply first, learn second) → proposes memories
    (Decision #8). Proposed memories confirmed in a **batched review panel**, not inline in chat.

18. **LLM gateway abstraction** — One `LLMClient` interface (`chat` + `embed`); `MockLLM`
    (offline, deterministic — dev/laptop/tests) and `LangdockLLM` (OpenAI-compatible HTTP — prod).
    `get_llm()` returns Langdock only in production WITH a key; otherwise mock. No direct
    Langdock imports elsewhere. (TODO: bump asyncpg→0.30+ for Python 3.13.)

19. **Background jobs** — v1 **in-process** behind a `TaskRunner` seam (`InProcessRunner` now;
    arq+Redis `DurableRunner` later). Async extraction runs fire-and-forget; the proactive
    scheduler (APScheduler, TODO) uses the same seam. No infra to install for laptop/v1.

20. **Chat orchestrator** — `handle_turn()` wires the loop and depends only on interfaces
    (`ChatPort`, `LLMClient`, `TaskRunner`) → runs end-to-end with mocks, no DB. Reply first,
    extract second. This is the integrating spine; DB-backed `ChatPort` is the next build.

## Open (next to grill)

- DB-backed `ChatPort` + `/chat` endpoint → a runnable local assistant (`docker compose up`).
- Microsoft Graph + Jira integrations (OAuth on top of Entra SSO) + the warm-start scan.
- EU production hosting (Hetzner / IONOS / Azure EU / Scaleway).
- Frontend (React) + Teams bot (second surface).
- Data model: does "goal" deserve a first-class memory type? (v1 stores it as a goal-flagged
  `pattern`.) Revisit if goals become central to coaching.
- Hosting/provider for EU production (candidates: Hetzner, IONOS, Azure EU, Scaleway).
