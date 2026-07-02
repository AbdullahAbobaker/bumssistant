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
- Frontend + Teams bot (second surface). **Frontend framework DECIDED (2026-07-02): Vite + React +
  TypeScript + Tailwind** (SPA over the FastAPI backend). Design language: **Immersive Ambient
  Glassmorphism** ("Liquid Glass") — monochrome-first (state via opacity/white-fill, not brand color),
  time-aware ambient backdrop (user-selectable), legibility-first (scrim under every glass surface,
  text ≥4.5:1). Full plan: [docs/design/2026-07-02-ui-plan-ambient-glassmorphism.md]. Build not started —
  first slice = chat surface + app shell + glass token system. Teams bot still open.
- Data model: does "goal" deserve a first-class memory type? (v1 stores it as a goal-flagged
  `pattern`.) Revisit if goals become central to coaching.
- Hosting/provider for EU production (candidates: Hetzner, IONOS, Azure EU, Scaleway).
- **Code-execution sandbox for a future agent feature** — candidate: [CubeSandbox](https://github.com/TencentCloud/CubeSandbox)
  (Tencent, KVM/RustVMM-based, E2B-protocol compatible, sub-60ms cold start). Would isolate
  untrusted code run on a user's behalf (e.g. an agentic task-automation capability), not
  needed for the current chat/memory/proactive scope. Self-hosted, requires x86_64 Linux +
  KVM — fits the "EU-hosted" constraint (#1) if run on our own infra, but adds a new
  privileged component to vet under DSGVO (PRIVACY.md) before any user code/data enters it.
  No concrete feature depends on it yet; revisit once an agent/code-exec feature is scoped.

### Proposed (grill before building)

- **#21 (proposed) — Action primitive: define once, reuse across every surface.** The one
  genuinely elegant idea from the Agent-Native spike (see Evaluated & parked), ported to *our*
  stack. Today BumFlow can only talk (`handle_turn` → `llm.chat` → text) and every HTTP route is
  hand-written. Introduce a single capability abstraction so each BumFlow operation is defined
  ONCE and exposed as an HTTP endpoint, an agent tool, a CLI command, and (later) an MCP tool —
  no per-surface boilerplate. Pure Python/FastAPI + Pydantic (our Zod); **no new runtime, no
  pgvector loss** — we deliberately do NOT take Agent-Native's TS runtime / ORM / SQLite fallback
  / bundled telemetry.

  Shape:
  ```python
  @action(name="create_task", description="Lege eine Aufgabe an.", read_only=False)
  async def create_task(inp: CreateTask, ctx: ActionContext) -> TaskOut: ...
  ```
  - `inp` = a Pydantic model → runtime validation **and** the JSON-Schema for the LLM tool.
  - `ctx: ActionContext` = injected `{current_user, session_factory, llm}` → DSGVO user-scoping
    is enforced in ONE place, not re-derived per route.
  - A registry maps `name → Action`; thin adapters read from it:
    - **HTTP**: auto-mount `/actions/{name}` (`read_only` → GET, else POST). `/health`,`/me`,
      `/chat` stay as-is.
    - **Agent tool**: Pydantic schema → tool JSON-Schema; the orchestrator offers the registry as
      tools and a tool-call dispatches to the same handler. Needs `LLMClient.chat(tools=…)` —
      extends the gateway once (Mock + Langdock, per #18). This is the "BumFlow can *act*" step.
    - **CLI**: `python -m app.actions <name> '{json}'` (dev/scripting/tests).
    - **MCP**: expose the same registry as MCP tools later (new adapter, no new definitions).

  Fit with locked decisions:
  - `read_only` flag (borrowed from Agent-Native) gates side effects. Write-actions that create
    memory route through **propose-then-confirm (#8)**: the action proposes, the batched review
    panel (#17) confirms — the model never silently mutates confirmed memory.
  - Guardrails (#14: never invent tasks/deadlines) get *stronger*: actions become the only path
    by which the model changes state, so every mutation is schema-validated + provenance-stamped.
  - Reliability bar (CLAUDE.md): registry, schema→tool conversion, `read_only`→verb mapping, and
    dispatch are all **pure, DB-free unit-testable**; handlers reuse the already-tested repository.

  Migration path (incremental — nothing ripped out):
  1. `app/actions/` (`Action`, `@action`, registry) + HTTP adapter; port ONE capability
     (`list_projects`) to prove the seam. Existing routes untouched.
  2. Add `create_task` + `confirm_memory` (the propose-then-confirm write path).
  3. Extend `LLMClient.chat` for tool-calling; orchestrator offers the registry → BumFlow acts.
  4. Optional MCP adapter over the same registry (for external agents / A2A).

  Open questions to grill: flat `/actions/{name}` vs per-action HTTP paths; do we need a separate
  `outward: bool` flag (email/Teams sends) beyond `read_only` for extra confirmation; and should
  tool-calling (step 3) wait until Graph/Jira integrations give BumFlow something worth calling.

- **#22 (proposed) — Scope promotion: personal → team → org learning loop.** From an external
  briefing (Gemini/Antigravity, reviewed 2026-07-01). Today memories live in per-user silos; this
  adds a `scope ∈ {personal, team, org}` so knowledge can flow upward. Retrieval unions across
  scopes and weights by scope in score-fusion (personal ≫ team ≫ org), so personal memory outranks
  org priors but org knowledge still surfaces when the user has none (#16). Promotion runs as a
  background scan (#19) that clusters similar personal memories across users and **proposes** a
  depersonalized team/org memory through the existing confirm gate (#8); this is the concrete build
  of warm-start Phase 3 "shared team/org priors" (#9). A `promote_memory` @action fits #21.
  **Status: sound concept, NOT buildable as written.** Blockers/caveats before it can proceed:
  - **LEGAL GATE (hard):** cross-user knowledge flow about identifiable clients/colleagues is
    co-determination territory — requires DSGVO + Betriebsrat sign-off (see PRIVACY.md open items)
    BEFORE any cross-user flow ships. Depersonalization is the *confirmer's* job, not an automated
    strip; consent should likely be opt-**in**, not opt-out.
  - **Schema bugs to fix:** `source='promotion'` is not in the `memory_source` enum (needs
    `ALTER TYPE ... ADD VALUE`); `users` has no `team_id`/`org_id` mapping for the union query;
    multi-source provenance won't fit the single-UUID `superseded_by` (needs an array/join table).
  - **Two hidden subsystems:** roles/RBAC (no team-lead/admin concept exists today) and cross-user
    detection + entity resolution ("same entity Müller across users" is unsolved) are each their
    own project, not a filter/threshold.
  - **First safe slice:** admin-authored **top-down org memories** (`scope='org'`, `status=
    'confirmed'`) — delivers value, needs no detection pipeline, and **no personal data flows
    upward**. Everything cross-user waits on the legal gate. Ships with pure DB-free tests per
    module (CLAUDE.md): scope weighting, detection scoring, depersonalization checks.

### Evaluated & parked

- **Agent-Native (BuilderIO/agent-native)** — spiked hands-on 2026-07-01 (headless scaffold
  built, installed, ran). A heavyweight full-stack **TypeScript/React** framework: one "action"
  definition powers UI + agent + HTTP + MCP + A2A + CLI, with its own agent runtime
  (chat/tools/skills/memory/jobs) over SQL-backed stores. Verdict: **not adopted as backend.**
  - **The good:** the core primitive is genuinely elegant — `defineAction({ description, schema:
    zod, http, readOnly, run })` is written once and callable from CLI (`pnpm action hello`), the
    app-agent loop (`pnpm agent "..."`), HTTP, and MCP. Confirmed working: `pnpm action hello
    '{"name":"Builder"}'` → `{ message: 'Hello, Builder!' }`.
  - **The cost / misfit:** it brings its *own* SQL layer + state stores (SQLite/PGlite/`postgres`
    by default, not pgvector), agent runtime, and LLM/token wiring — each duplicates a locked
    Bumssistant module (pgvector hybrid memory #16, `LLMClient`→Langdock #5/#18, orchestrator #20)
    already built and tested. Footprint is large (765 pkgs / ~703 MB node_modules for the
    *minimal* headless app) on a bleeding-edge toolchain (TS 6 native-preview `tsgo`, `@types/node`
    24, oxfmt) with fast version churn (core 0.80.x, 0.84.x already out). DSGVO: default deps pull
    Sentry + OpenTelemetry — telemetry surface to vet before any use.
  - *Possible future revisit ONLY as the frontend/UI surface (Decision: React frontend), with the
    Python brain as an external backend — but the "actions" model assumes its own runtime + SQL
    stores, so fit is uncertain. Not a backend replacement.*
