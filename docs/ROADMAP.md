# Bumssistant — 10x Roadmap

*Written 2026-07-06, based on a full codebase review. Companion to [DECISIONS.md](../DECISIONS.md)
(which stays the source of truth for locked decisions) and [PRIVACY.md](../PRIVACY.md).*

## Where the codebase actually is

The core loop is **built and tested end-to-end**: `POST /chat` → DB-backed `ChatPort` →
hybrid memory retrieval → BumFlow persona → tool-calling (bounded loop, read-only +
agent-writable actions) → reply → async memory extraction with health deny-list →
proposed memories. The actions registry serves four surfaces (HTTP, CLI, agent tools, MCP).
The frontend ships slice 1: chat-first hero with the glass token system, wired to the real
`/chat` endpoint.

## The 10x thesis

Today BumFlow is a **capable chatbot that only knows what you type at it, only speaks when
spoken to, and learns things nobody can confirm**. The value multiplier is not any single
feature — it is closing three broken loops, in this order:

1. **The learning loop is open.** Extraction proposes memories, but there is no UI or
   action to review them, so nothing ever becomes `confirmed` and the memory flywheel never
   spins. (Decision #8's confirm gate exists in the schema; the confirmer doesn't.)
2. **The initiative loop is open.** The proactive composers exist and self-suppress
   correctly, but no scheduler fires them and no surface delivers them. An
   anti-procrastination coach that never initiates is a FAQ bot.
3. **The context loop is open.** BumFlow can't see the calendar, inbox subjects, or Jira —
   so every conversation starts from zero knowledge of the user's actual day. This is the
   difference between "a chat window" and "an assistant."

Everything below is sequenced to close loop 1 (days), loop 2 (a week), loop 3 (the big
one), then compound the value at team/production level.

Global acceptance criteria applying to **every** feature (per CLAUDE.md):

- Every new module has pure, DB-free unit tests; `python -m pytest -q` green before merge.
- No module imports Langdock except `app/llm.py`.
- Anything AI-inferred lands as `status='proposed'` (Decision #8).
- UI text and BumFlow output German-default, user-led (Decision #15).

---

## Phase 0 — Close the learning loop (est. ~1 week)

### F0.1 Memory review panel (frontend slice 2 + supporting actions)

The single highest-leverage small feature: it makes everything already built actually work.

**Build:** `list_proposed_memories` (read_only) and `reject_memory` actions in
`app/actions/builtin.py`; Review view replacing the `EmptyState` stub — card stack with
Bestätigen / Ablehnen; `ProposedMemoriesTeaser` bound to the real count.

**Acceptance criteria:**
- [ ] `POST /actions/list_proposed_memories` returns only the caller's memories with
      `status='proposed'`, including `title`, `note`, `type`, `confidence`, `source`,
      `created_at`, ordered newest first.
- [ ] `reject_memory` flips `proposed → rejected` scoped to owner + current status in the
      WHERE clause (same pattern as `confirm_memory`); rejecting an already-decided memory
      is a no-op that reports failure, not an exception.
- [ ] Neither action is offered to the agent as a tool beyond existing rules
      (`reject_memory` is user-only, like `confirm_memory`).
- [ ] Review view lists proposed memories as cards; confirm/reject each; card leaves the
      stack without full reload; empty state shown when queue is empty.
- [ ] Sidebar teaser badge shows the real proposed count and navigates to Review.
- [ ] A memory confirmed in the panel appears in the next chat turn's context (visible in
      a test via `build_system_prompt` memory summary).
- [ ] Pure unit tests for both actions' filtering/scoping; Vitest component tests for the
      panel (confirm, reject, empty state).

### F0.2 Task actions + live sidebar data

**Build:** `list_tasks` (read_only, agent-offered), `complete_task` and `update_task`
(agent_writable with provenance, like `create_task`); bind `TaskWidget` to `list_tasks`
and `ProfileCard` to `/me`.

**Acceptance criteria:**
- [ ] `list_tasks` returns the caller's task-type memories with `state`, `due_at`,
      overdue-first ordering; agent can call it (read_only).
- [ ] `complete_task` sets `state='done'`; initiated by user → applied directly; initiated
      by agent → applied with `source='ai_inferred'` provenance stamped (never invents a
      completion — only via explicit tool call in a turn).
- [ ] TaskWidget shows real tasks; checkbox calls `complete_task`; completed task drops
      from the due list on next fetch.
- [ ] ProfileCard shows the `/me` display name — no hardcoded "Abdullah" anywhere.
- [ ] BumFlow can answer "Was steht heute an?" via `list_tasks` (MockLLM script test).
- [ ] Pure unit tests for provenance/scoping of each new action.

### F0.3 Persistent chat history

Currently the thread lives only in React state; a reload loses it, though the DB has it.

**Acceptance criteria:**
- [ ] `GET /chat/history?limit=N` returns the caller's last N messages (role, content,
      created_at) from the persistent thread.
- [ ] ChatWidget loads history on mount; reloading the page shows the same conversation.
- [ ] `briefing`-role messages render visually distinct from assistant messages.

### F0.4 Onboarding flow (frontend slice 4)

**Build:** first-login detection via `users.onboarded_at IS NULL`; short dialog from
`app/onboarding/questions.py` (coaching_style mandatory, goals/stress_triggers optional).

**Acceptance criteria:**
- [ ] New user (onboarded_at null) sees the onboarding dialog before first chat; existing
      users never see it.
- [ ] coaching_style is required and stored as a **confirmed** `comm_style` memory with
      `source='user_explicit'`; the chosen tone demonstrably changes `build_system_prompt`
      output (existing tone-modifier test extended).
- [ ] goals / stress_triggers are skippable; stress_triggers stored as
      `pattern:stress_trigger` (Decision #13), never as a health inference.
- [ ] Completing (or skipping optionals) sets `onboarded_at`; flow never reappears.
- [ ] `is_complete()` logic covered by existing pure tests; new answers→memory mapping has
      its own DB-free test.

---

## Phase 1 — Close the initiative loop: BumFlow shows up (est. ~1 week)

### F1.1 Proactive scheduler

**Build:** APScheduler (per Decision #19, behind the same seam philosophy — a
`Scheduler` protocol so tests stay pure) reading `proactive_rules`
(status confirmed/active), firing `compose_morning_briefing` / `compose_midday_checkin` /
`compose_end_of_day_recap` at `send_time` in the user's `timezone` on selected `weekdays`,
writing results as `role='briefing'` messages in the user's thread.

**Acceptance criteria:**
- [ ] Due-rule computation ("which rules fire at instant T?") is a pure function with unit
      tests covering timezone, weekday mask, and `last_fired_at` dedupe (a slot never
      fires twice for the same local day).
- [ ] When a composer returns `None` (self-suppression, Decision #12), **no message row is
      written** — verified by test.
- [ ] Briefing content is informational only (v1 policy) and sourced from the same
      `load_context` data as chat — no separate query path to drift.
- [ ] Scheduler starts with the app, survives a rule being paused mid-flight, and failures
      in one user's briefing never block others (best-effort per user, logged).
- [ ] Onboarding (F0.4) seeds default rules as `proposed`; user confirmation activates them
      (same gate as memory, Decision #12).

### F1.2 In-app delivery + rule management

**Acceptance criteria:**
- [ ] Opening the app shows unseen briefings in the thread (via F0.3 history) with an
      unread indicator on the chat rail item.
- [ ] Settings view (replacing its stub) lists the user's proactive rules with
      pause/resume and time editing via actions (`list_proactive_rules`,
      `update_proactive_rule` — user-only, not agent tools).
- [ ] Pausing a rule takes effect before its next scheduled firing (test at the pure
      due-rule level).

---

## Phase 2 — Close the context loop: BumFlow knows your work (est. ~3–4 weeks)

This is the 10x core. Order matters: auth is the OAuth foundation for Graph.

### F2.1 Entra ID token validation (production auth)

Resolves the `TODO` at `app/auth.py:38`.

**Acceptance criteria:**
- [ ] Bearer JWTs validated against Entra JWKS: signature, issuer, audience, expiry;
      invalid/expired → 401 with no user side effects.
- [ ] First valid login upserts the user by `entra_oid` and seeds profile fields
      (warm-start phase 0, Decision #9).
- [ ] JWKS fetched with caching + key-rotation tolerance; validation logic is pure and
      tested against a locally generated fake JWKS (no network in tests).
- [ ] Dev bypass behavior unchanged and still fail-closed in production (existing test
      still green).

### F2.2 Microsoft Graph — calendar first

**Acceptance criteria:**
- [ ] OAuth incremental consent on top of Entra SSO; refresh tokens stored encrypted at
      rest (key from env, never logged); user can disconnect, which deletes tokens.
- [ ] `load_context` always-on core includes today's remaining meetings (title, time,
      attendee **count** — metadata only, Decision #10) when the integration is connected;
      chat and morning briefing both use it ("Du hast um 14:00 das Team-Meeting…").
- [ ] Graph calls only run when `effective_scan_mode` permits; any non-prod environment
      uses mock fixtures — enforced by test.
- [ ] Graph client sits behind its own small port (protocol + mock) so orchestrator/
      composer tests stay DB- and network-free.
- [ ] AVV/DPA checklist item for Microsoft processing recorded in PRIVACY.md before prod
      enablement (legal gate, tracked not code-solved).

### F2.3 Jira integration

**Acceptance criteria:**
- [ ] Issues assigned to the user sync as task memories with `source='integration'`,
      auto-`confirmed` (structured facts, Decision #8), Jira key stored in `details` JSONB
      as the dedupe/idempotency key — re-sync updates, never duplicates.
- [ ] Sync runs as a background job through the `TaskRunner` seam; a failed sync never
      affects chat availability.
- [ ] Jira-sourced tasks appear in `list_tasks`, the sidebar, and briefings,
      indistinguishable in UX from native tasks but auditable via `source`.
- [ ] v1 is read-only (no writes back to Jira); pure tests for the issue→memory mapping
      and dedupe.

### F2.4 Warm-start scan (Decision #9 phases 1–2)

**Acceptance criteria:**
- [ ] Background scan over calendar/Jira metadata + email **subjects only**; produces a
      style/pattern summary; raw subjects verifiably discarded (no table, log, or field
      retains them — asserted in tests of the scan module).
- [ ] Every scan-derived memory arrives as `status='proposed'` and flows into the F0.1
      review panel; onboarding *reflects* top inferences back ("Sieht so aus, als arbeitest
      du viel an Projekt X — stimmt das?") instead of cold questions.
- [ ] `effective_scan_mode` forced to `mock` outside production — existing config test
      extended to cover the scan entry point itself.
- [ ] Transparency notice (PRIVACY.md open item) drafted and linked from onboarding before
      the scan is enabled for real users.

---

## Phase 3 — Compound: team value & production (est. ~3–4 weeks)

### F3.1 Admin-authored org memories (safe slice of #22)

No cross-user data flow — no legal gate crossed. Delivers "BumFlow knows how we work here."

**Acceptance criteria:**
- [ ] Migration adds `scope ∈ {personal, team, org}` (default `personal`) and an
      `is_admin` flag on users; `ALTER TYPE memory_source` extended as flagged in #22.
- [ ] `create_org_memory` action is admin-only (403 otherwise), writes
      `scope='org', status='confirmed'`.
- [ ] Retrieval unions org memories into every user's candidate set; score-fusion weights
      personal ≫ org so personal memory always outranks org priors — weighting covered by
      pure retrieval tests.
- [ ] No code path promotes personal→team/org (explicitly out of scope until the
      Betriebsrat/DPO gate in PRIVACY.md is cleared).

### F3.2 DSGVO self-service (differentiator for the German market)

**Acceptance criteria:**
- [ ] `export_my_data` action produces a complete JSON export of the caller's memories,
      messages, rules, and profile (Art. 15/20 DSAR) — downloadable from Settings.
- [ ] Account deletion endpoint cascades (existing `ON DELETE CASCADE`) and revokes stored
      integration tokens; verified by test at the repository level.
- [ ] Memory viewer (frontend slice 3): searchable list of confirmed memories with
      provenance (source, confidence, dates) and per-memory archive — the user can see and
      correct everything BumFlow believes.

### F3.3 EU production hosting + durable jobs

**Acceptance criteria:**
- [ ] Deployed to a chosen EU provider (Hetzner/IONOS/Azure EU/Scaleway — decide and
      append to DECISIONS.md) with TLS, backups, and migration-on-deploy.
- [ ] `DurableRunner` (arq + Redis) implements the existing `TaskRunner` protocol;
      extraction, sync, and scheduler jobs survive a process restart; `InProcessRunner`
      remains the dev default — swap is config only.
- [ ] Health/readiness endpoints cover DB, Redis, and Langdock reachability; structured
      logs contain **no message content or memory text**.
- [ ] `DEV_AUTH_BYPASS` and mock scan-mode guards verified in the prod environment
      (fail-closed smoke test in CI/CD).

### F3.4 Teams bot (second surface)

**Acceptance criteria:**
- [ ] Bot Framework endpoint maps Teams identity → `entra_oid` → same user, same brain:
      messages go through `handle_turn` with zero orchestrator changes (thin client,
      Decision #2).
- [ ] Proactive briefings deliver to Teams when the user enables that channel; channel
      choice lives on the proactive rule; web remains the fallback.
- [ ] Conversation is the same single thread — a chat started in Teams is visible in the
      web history and vice versa.

---

## Phase 4 — v2 quality (backlog, not scheduled)

- **Retrieval v2** (Decision #16 deferred list): cross-encoder/LLM reranker behind the
  fusion seam, true BM25. AC anchor: a fixed eval set of (query → expected memory) pairs
  with recall@k measured before/after; reranker ships only if it beats deterministic fusion.
- **Streaming replies** (SSE on `/chat`) once tool-round UX for streaming is designed.
- **Coaching content** in proactive slots (confidence-gated, Decision #12 deferral).
- **Cross-user scope promotion** — only after the PRIVACY.md legal gate; design already
  grilled in #22.
- **Action ecosystem growth** (snooze_task, create_project, weekly review generator) —
  each is one `@action`, automatically on all four surfaces.

## Sequencing rationale (TL;DR)

| Phase | Loop closed | Why this order |
|---|---|---|
| 0 | Learning | Days of work; makes the already-built memory system real |
| 1 | Initiative | The product's identity (anti-procrastination coach) requires initiative |
| 2 | Context | Biggest single multiplier; needs auth (2.1) first as OAuth foundation |
| 3 | Team/prod | Value compounds only once individuals trust it; org memories + hosting |

Dependencies: F0.1 → F2.4 (review panel must exist before warm-start floods it with
proposals). F0.3 → F1.2 (history endpoint before briefing delivery). F2.1 → F2.2 (auth
before Graph OAuth). F1.1 → F3.4 (scheduler before Teams delivery channel).
