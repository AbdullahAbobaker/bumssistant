# Bumssistant Roadmap — Master Development Task List

> **For agentic workers:** This is the whole-roadmap master plan. Each feature (F0.1 … F3.4)
> is executed through the normal cycle — `superpowers:brainstorming` (spec) →
> `superpowers:writing-plans` (full code-level plan) → `superpowers:subagent-driven-development`
> (build) — one feature at a time, in the order below. Tasks here are right-sized and carry
> the **proof tests** that gate them; the per-feature build plan expands each task into full
> TDD steps with complete code. Checkboxes track feature/task completion across sessions.

**Goal:** Close the three broken loops from [ROADMAP.md](../ROADMAP.md) — learning (Phase 0),
initiative (Phase 1), context (Phase 2) — then compound at team/production level (Phase 3).

**Architecture:** One FastAPI backend brain (actions registry on four surfaces, port/protocol
seams for DB, LLM, scheduler, integrations), Postgres + pgvector hybrid memory with
propose-then-confirm provenance, thin clients (React web now, Teams later).

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy async + Postgres/pgvector; Langdock via
`app/llm.py` only; APScheduler (Phase 1); arq + Redis (Phase 3); React 19 + TS + vitest.

## Global Constraints (apply to every task)

- Every new module has pure, DB-free unit tests; `python -m pytest -q` green before merge.
- Frontend gate: `npm run test -- --run` + `npm run build` + `npm run lint` green (node ≥ 20).
- Nothing imports Langdock except `app/llm.py` (`LLMClient` protocol; MockLLM in dev/tests).
- Anything AI-inferred lands `status='proposed'` (Decision #8); `_task_provenance` stays fail-closed.
- Health/mental-state data is never stored (Decision #10, `HEALTH_DENYLIST`).
- UI text and BumFlow output German-default (Decision #15). No external hotlinks (DSGVO).
- New actions go through `@action` in `app/actions/` — automatically on HTTP/CLI/agent/MCP
  surfaces; agent exposure only via `read_only=True` or explicit `agent_writable=True`.
- Append architectural decisions to DECISIONS.md; legal gates tracked in PRIVACY.md.
- Feature order respects dependencies: F0.1→F2.4, F0.3→F1.2, F2.1→F2.2, F1.1→F3.4.

---

# Phase 0 — Close the learning loop (~1 week)

## F0.1 Memory review panel  *(frontend slice 2 + actions)*

### Task 0.1.1: `list_proposed_memories` action
**Files:** Modify `app/actions/builtin.py`; Test `tests/test_builtin_memory_review.py`
**Interfaces:** Produces `list_proposed_memories(inp: NoArgs, ctx: ActionContext) -> list[ProposedMemoryOut]`,
`read_only=True`; `ProposedMemoryOut = {id, title, note, type, confidence, source, created_at}`.
- [ ] Returns only `ctx.user_id`'s rows with `status='proposed'`, ordered `created_at DESC`.
- [ ] **Proof tests (pure, fake session):** `test_list_proposed_scopes_to_caller` (another
  user's proposed memory absent); `test_list_proposed_excludes_confirmed_and_rejected`;
  `test_list_proposed_newest_first`; `test_list_proposed_is_agent_tool` (`is_agent_tool()`
  is True — read-only is safe for the agent).

### Task 0.1.2: `reject_memory` action
**Files:** Modify `app/actions/builtin.py`; Test `tests/test_builtin_memory_review.py`
**Interfaces:** Produces `reject_memory(inp: RejectMemoryIn{memory_id}, ctx) -> RejectMemoryOut{ok, memory_id}`,
`read_only=False`, `agent_writable=False` (user-only, mirror of `confirm_memory`).
- [ ] UPDATE … WHERE `id = :id AND user_id = :caller AND status = 'proposed'` → `rejected`.
- [ ] **Proof tests:** `test_reject_flips_proposed_to_rejected`;
  `test_reject_already_decided_reports_failure_not_exception` (`ok=False`, no raise);
  `test_reject_other_users_memory_fails` (scoping); `test_reject_not_in_agent_tool_schemas`
  (absent from `registry.tool_schemas()` offered to the agent, like `confirm_memory`).

### Task 0.1.3: Review view (React)
**Files:** Create `frontend/src/components/ReviewView.tsx` + `.css` + `.test.tsx`;
Modify `frontend/src/App.tsx` (`review` case renders `ReviewView`), `ProposedMemoriesTeaser` binding.
**Interfaces:** Consumes `GET /actions/list_proposed_memories`, `POST /actions/confirm_memory`,
`POST /actions/reject_memory` (vite proxy). Produces `ReviewView()` card stack with
Bestätigen / Ablehnen per card.
- [ ] Card leaves the stack on decision without full reload (optimistic remove, rollback on error).
- [ ] Empty queue shows a German empty state ("Alles erledigt…").
- [ ] Teaser badge shows the real count from `list_proposed_memories` and navigates to Review.
- [ ] **Proof tests (vitest, fetch mocked):** `renders proposed memory cards from API`;
  `confirm removes card and POSTs confirm_memory`; `reject removes card and POSTs reject_memory`;
  `shows empty state when queue empty`; `teaser shows live count`. Full gate green.

### Task 0.1.4: Confirmed memory reaches the next turn
**Files:** Test `tests/test_review_roundtrip.py` (uses fake ChatPort + MockLLM)
- [ ] **Proof test:** `test_confirmed_memory_appears_in_system_prompt` — memory flipped
  `proposed→confirmed` is included by `load_context` → `_compose_memory_block` /
  `build_system_prompt` on the next `handle_turn`; while `proposed` it is not.

## F0.2 Task actions + live sidebar data

### Task 0.2.1: `list_tasks` action (agent-offered)
**Files:** Modify `app/actions/builtin.py`; Test `tests/test_builtin_tasks.py`
**Interfaces:** Produces `list_tasks(inp: NoArgs, ctx) -> list[TaskOut]`, `read_only=True`;
`TaskOut = {id, title, state, due_at, project_id, source}`.
- [ ] Caller's `type='task'` memories, `state != 'done'` by default, ordered overdue-first
  (`due_at ASC NULLS LAST`).
- [ ] **Proof tests:** `test_list_tasks_overdue_first`; `test_list_tasks_excludes_done`;
  `test_list_tasks_scoped_to_caller`; `test_list_tasks_offered_to_agent`.

### Task 0.2.2: `complete_task` + `update_task` actions
**Files:** Modify `app/actions/builtin.py`; Test `tests/test_builtin_tasks.py`
**Interfaces:** Produces `complete_task(inp: {task_id}, ctx)` and
`update_task(inp: {task_id, title?, due_at?, state?}, ctx)`, both `agent_writable=True`
using `_task_provenance(ctx.initiator)`.
- [ ] `complete_task` sets `state='done'`; user-initiated applies directly; agent-initiated
  stamps `source='ai_inferred'` provenance (the fail-closed `_task_provenance` pattern).
- [ ] **Proof tests:** `test_complete_task_user_initiator_direct`;
  `test_complete_task_agent_initiator_stamps_ai_inferred`;
  `test_update_task_scoped_to_owner`; `test_unknown_initiator_treated_as_agent` (fail-closed).

### Task 0.2.3: Sidebar goes live
**Files:** Modify `frontend/src/components/widgets/TaskWidget.tsx` + test,
`frontend/src/components/widgets/ProfileCard.tsx` + test, `frontend/src/components/ChatView.tsx`
- [ ] TaskWidget fetches `list_tasks`; checkbox POSTs `complete_task`; completed task gone
  on next fetch. ProfileCard shows `/me` display name — grep proves no hardcoded "Abdullah".
- [ ] **Proof tests (vitest):** `TaskWidget renders fetched tasks`; `checkbox completes task`;
  `ProfileCard renders /me display_name`; plus backend MockLLM script test
  `test_agent_answers_was_steht_heute_an_via_list_tasks` (tool call observed in the loop).

## F0.3 Persistent chat history

### Task 0.3.1: History endpoint
**Files:** Modify `app/main.py`, `app/chat/repository.py`; Test `tests/test_history.py`
**Interfaces:** Produces `GET /chat/history?limit=N` → `[{role, content, created_at}]`
(caller-scoped, chronological), backed by a repository method `load_history(user_id, limit)`.
- [ ] **Proof tests:** `test_history_returns_own_messages_only`;
  `test_history_respects_limit_and_order`; `test_history_includes_briefing_role`.

### Task 0.3.2: ChatWidget loads history
**Files:** Modify `frontend/src/components/widgets/ChatWidget.tsx` + test
- [ ] History fetched on mount; reload shows the same conversation; `briefing` messages render
  visually distinct (own bubble class + label "Briefing").
- [ ] **Proof tests (vitest):** `loads and renders history on mount`;
  `briefing messages get briefing styling`; existing send/receive tests stay green.

## F0.4 Onboarding flow  *(frontend slice 4)*

### Task 0.4.1: Onboarding status + submit actions
**Files:** Modify `app/actions/builtin.py`, `app/main.py` (`/me` exposes `onboarded: bool`);
Test `tests/test_onboarding_submit.py`
**Interfaces:** Produces `submit_onboarding(inp: {answers: dict[str,str]}, ctx) -> {ok}`
(user-only). Consumes `app/onboarding/questions.py:required_keys()/is_complete()`.
- [ ] `coaching_style` required (rejects incomplete per `is_complete`); stored as **confirmed**
  `comm_style` memory, `source='user_explicit'`. `goals`/`stress_triggers` optional;
  stress stored as `pattern:stress_trigger` (Decision #13) — never a health inference.
  Sets `users.onboarded_at`.
- [ ] **Proof tests:** `test_submit_requires_coaching_style`;
  `test_answers_map_to_confirmed_user_explicit_memories`;
  `test_stress_trigger_stored_as_pattern_not_health`; `test_submit_sets_onboarded_at`;
  `test_resubmit_after_onboarded_is_noop`.

### Task 0.4.2: Onboarding dialog (React)
**Files:** Create `frontend/src/components/OnboardingDialog.tsx` + `.css` + `.test.tsx`;
Modify `frontend/src/App.tsx`
- [ ] Shown when `/me.onboarded === false`, blocking first chat; never for onboarded users;
  never reappears after submit/skip-optionals.
- [ ] **Proof tests (vitest):** `dialog shows for new user, not for onboarded`;
  `cannot submit without coaching_style`; `optional questions skippable`;
  `submit hides dialog and unblocks chat`. Backend: existing tone-modifier test extended —
  chosen `coaching_style` demonstrably changes `build_system_prompt` output.

---

# Phase 1 — Close the initiative loop (~1 week)

## F1.1 Proactive scheduler

### Task 1.1.1: Pure due-rule engine
**Files:** Create `app/proactive/schedule.py`; Test `tests/test_proactive_schedule.py`
**Interfaces:** Produces `due_rules(rules: list[RuleRow], now_utc: datetime) -> list[RuleRow]`
(pure) — a rule fires iff `status='confirmed'`, local time in `timezone` matches `send_time`
window, ISO weekday in `weekdays`, and `last_fired_at` is not the same local day.
- [ ] **Proof tests:** `test_fires_at_local_send_time_in_timezone` (Europe/Berlin vs UTC);
  `test_weekday_mask_respected`; `test_same_local_day_dedupe_via_last_fired_at`;
  `test_paused_or_proposed_rules_never_fire`; DST boundary case
  `test_dst_transition_does_not_double_fire`.

### Task 1.1.2: Scheduler seam + APScheduler adapter
**Files:** Create `app/proactive/scheduler.py`; Modify `app/main.py` (startup/shutdown),
`requirements.txt` (apscheduler); Test `tests/test_scheduler_tick.py`
**Interfaces:** Produces `Scheduler` protocol + `tick(now_utc, session_factory)` coroutine:
loads confirmed rules → `due_rules` → builds `BriefingContext` from the same `load_context`
data as chat → calls `compose_morning_briefing/compose_midday_checkin/compose_end_of_day_recap`
→ writes `role='briefing'` message + updates `last_fired_at`.
- [ ] Composer returning `None` (self-suppression, Decision #12) writes **no message row**.
- [ ] Per-user isolation: one user's failure logged, others still delivered.
- [ ] **Proof tests (fake port, no APScheduler in tests):** `test_tick_writes_briefing_message`;
  `test_none_composition_writes_nothing`; `test_one_user_failure_does_not_block_others`;
  `test_tick_updates_last_fired_at`; `test_briefing_content_is_informational_only`
  (v1 policy string check).

### Task 1.1.3: Default rules seeded at onboarding
**Files:** Modify `app/actions/builtin.py` (`submit_onboarding`); Test extends `tests/test_onboarding_submit.py`
- [ ] Onboarding seeds morning/midday/EOD rules as `status='proposed'`; confirmation activates
  (same gate as memory).
- [ ] **Proof tests:** `test_onboarding_seeds_proposed_rules`;
  `test_proposed_rules_do_not_fire_until_confirmed` (reuses due-rule engine).

## F1.2 In-app delivery + rule management

### Task 1.2.1: Rule actions
**Files:** Modify `app/actions/builtin.py`; Test `tests/test_rule_actions.py`
**Interfaces:** Produces `list_proactive_rules` (read_only=False for agent? **No** — user-only:
`read_only=True` but explicitly filtered from agent tools via `agent_writable=False` +
exclusion list if needed; simplest compliant shape: user-only non-read_only wrapper) and
`update_proactive_rule(inp: {rule_id, status?, send_time?}, ctx)` — **neither offered to the agent**.
- [ ] **Proof tests:** `test_rules_scoped_to_caller`; `test_pause_takes_effect_before_next_fire`
  (pure: paused rule absent from `due_rules` at its next slot); `test_rule_actions_not_agent_tools`.

### Task 1.2.2: Unread briefings + Settings view
**Files:** Modify `frontend/src/App.tsx` (unread badge on chat rail item);
Create `frontend/src/components/SettingsView.tsx` + `.css` + `.test.tsx`
- [ ] Unseen briefings (arrived since last view) show unread indicator; Settings lists rules
  with pause/resume + time editing via the two actions.
- [ ] **Proof tests (vitest):** `unread badge appears when briefing newer than last seen`;
  `settings lists rules`; `pause toggles rule via update_proactive_rule`;
  `time edit posts new send_time`.

---

# Phase 2 — Close the context loop (~3–4 weeks)

## F2.1 Entra ID token validation

### Task 2.1.1: Pure JWT validation module
**Files:** Create `app/auth_entra.py`; Modify `requirements.txt` (PyJWT[crypto] or joserfc);
Test `tests/test_auth_entra.py`
**Interfaces:** Produces `validate_bearer(token: str, jwks: JWKS, *, issuer: str, audience: str,
now: datetime) -> EntraClaims{oid, name, email}`; raises `AuthError` on any failure.
- [ ] **Proof tests (locally generated RSA fake JWKS — zero network):**
  `test_valid_token_yields_claims`; `test_expired_token_rejected`;
  `test_wrong_issuer_rejected`; `test_wrong_audience_rejected`;
  `test_bad_signature_rejected`; `test_kid_rotation_picks_matching_key`.

### Task 2.1.2: Wire into `get_current_user` + upsert
**Files:** Modify `app/auth.py:38` (resolve the TODO); Test `tests/test_auth_wiring.py`
- [ ] Invalid/expired → 401 with **no user side effects**; first valid login upserts by
  `entra_oid` and seeds profile fields (warm-start phase 0, Decision #9); JWKS cached with
  key-rotation tolerance.
- [ ] **Proof tests:** `test_401_creates_no_user_row`; `test_first_login_upserts_by_entra_oid`;
  `test_second_login_does_not_duplicate`; existing
  `test_dev_bypass_refused_in_production` still green.

## F2.2 Microsoft Graph — calendar first

### Task 2.2.1: Graph port + mock
**Files:** Create `app/integrations/graph.py` (protocol + `MockGraph` + `HttpGraph`);
Test `tests/test_graph_port.py`
**Interfaces:** Produces `GraphPort.today_events(user_id) -> list[EventMeta{title, start, end,
attendee_count}]` — metadata only, never bodies/attendee lists (Decision #10).
- [ ] `HttpGraph` used only when `effective_scan_mode` permits; non-prod resolves `MockGraph`
  — enforced by a factory test.
- [ ] **Proof tests:** `test_event_meta_has_no_attendee_identities`;
  `test_factory_returns_mock_outside_production`; `test_mock_fixtures_deterministic`.

### Task 2.2.2: OAuth consent + token storage
**Files:** Create `app/integrations/msal_tokens.py`; Modify `app/main.py` (connect/disconnect
endpoints), migration `db/migrations/0005_integrations.sql`; Test `tests/test_token_store.py`
- [ ] Incremental consent on top of Entra SSO; refresh tokens encrypted at rest (Fernet key
  from env, never logged); disconnect deletes tokens.
- [ ] **Proof tests:** `test_tokens_encrypted_at_rest` (ciphertext != plaintext, decrypts back);
  `test_disconnect_deletes_tokens`; `test_encryption_key_never_in_logs` (log capture);
  repository-level round-trip with fake session.

### Task 2.2.3: Calendar in context + briefings
**Files:** Modify `app/chat/repository.py` (`load_context` always-on core),
`app/proactive/scheduler.py` (same data path); Test `tests/test_context_calendar.py`
- [ ] Today's remaining meetings (title, time, attendee **count**) in chat context and morning
  briefing when connected — one query path, no drift ("Du hast um 14:00 das Team-Meeting…").
- [ ] **Proof tests (MockGraph):** `test_meetings_in_system_prompt_when_connected`;
  `test_no_graph_call_when_disconnected`; `test_briefing_uses_same_load_context_data`.
- [ ] PRIVACY.md: AVV/DPA checklist item for Microsoft processing recorded **before** prod
  enablement (legal gate — tracked, not code-solved).

## F2.3 Jira integration

### Task 2.3.1: Issue→memory mapping (pure)
**Files:** Create `app/integrations/jira.py` (port + mapper + `MockJira`); Test `tests/test_jira_mapping.py`
**Interfaces:** Produces `issue_to_memory(issue: JiraIssue, user_id) -> MemoryRow` with
`type='task'`, `source='integration'`, `status='confirmed'` (structured facts, Decision #8),
Jira key in `details['jira_key']` as the idempotency key.
- [ ] **Proof tests:** `test_mapping_fields`; `test_resync_updates_not_duplicates`
  (same `jira_key` → update); `test_confirmed_and_integration_source`.

### Task 2.3.2: Background sync job
**Files:** Create `app/integrations/jira_sync.py`; wire through `app/background.py` `TaskRunner`;
Test `tests/test_jira_sync.py`
- [ ] Sync via the `TaskRunner` seam; a failed sync never affects chat availability
  (exception swallowed + logged); v1 read-only (no writes back to Jira).
- [ ] **Proof tests:** `test_sync_failure_does_not_raise_to_caller`;
  `test_synced_tasks_appear_in_list_tasks`; `test_source_integration_auditable`
  (indistinguishable in UX, distinguishable in data).

## F2.4 Warm-start scan (Decision #9 phases 1–2)

### Task 2.4.1: Scan module (subjects-only, discard-after-summarize)
**Files:** Create `app/warmstart/scan.py`; Test `tests/test_warmstart_scan.py`
**Interfaces:** Produces `run_scan(user_id, sources) -> list[MemoryCandidate]` over
calendar/Jira metadata + email **subjects only**; every derived memory `status='proposed'`.
- [ ] Raw subjects verifiably discarded: no table, log, or returned field retains them.
- [ ] **Proof tests:** `test_candidates_are_proposed`;
  `test_raw_subjects_absent_from_output_and_logs` (assert summary contains patterns, not
  subject strings; log capture clean); `test_scan_mode_forced_to_mock_outside_production`
  (extends existing config test to the scan entry point);
  `test_health_denylist_applies_to_scan_candidates`.

### Task 2.4.2: Onboarding reflects inferences
**Files:** Modify `frontend/src/components/OnboardingDialog.tsx`, `app/actions/builtin.py`
- [ ] Onboarding shows top inferences as confirmables ("Sieht so aus, als arbeitest du viel an
  Projekt X — stimmt das?") instead of cold questions; scan proposals land in the F0.1 panel.
- [ ] **Proof tests:** vitest `inference cards render and confirm into memories`; backend
  `test_scan_proposals_visible_in_list_proposed_memories`.
- [ ] PRIVACY.md transparency notice drafted + linked from onboarding **before** real-user scan.

---

# Phase 3 — Compound: team value & production (~3–4 weeks)

## F3.1 Admin-authored org memories (safe slice of #22)

### Task 3.1.1: Scope migration + admin flag
**Files:** Create `db/migrations/0006_scope.sql`; Test `tests/test_repository.py` extension
- [ ] `scope ∈ {personal, team, org}` default `personal`; `is_admin BOOLEAN DEFAULT FALSE` on
  users; `ALTER TYPE memory_source` extended as flagged in #22.
- [ ] **Proof test:** migration applies on a fresh compose DB; existing rows read back
  `scope='personal'`.

### Task 3.1.2: `create_org_memory` action + retrieval union
**Files:** Modify `app/actions/builtin.py`, `app/memory/retrieval.py`; Tests
`tests/test_org_memory.py`, extend `tests/test_core.py` retrieval tests
- [ ] Action admin-only (403 otherwise), writes `scope='org', status='confirmed'`; retrieval
  unions org memories into every candidate set with fusion weights personal ≫ org.
- [ ] **Proof tests:** `test_non_admin_403`; `test_org_memory_in_other_users_candidates`;
  `test_personal_outranks_org_at_equal_similarity` (pure fusion weighting);
  `test_no_codepath_promotes_personal_scope` (grep/API-level: no action mutates scope upward
  — Betriebsrat/DPO gate stays closed).

## F3.2 DSGVO self-service

### Task 3.2.1: `export_my_data` action
**Files:** Modify `app/actions/builtin.py`; Test `tests/test_dsar.py`
- [ ] Complete JSON export (memories, messages, rules, profile — Art. 15/20); downloadable
  from Settings.
- [ ] **Proof tests:** `test_export_contains_all_owned_rows_and_only_owned`;
  `test_export_schema_stable` (top-level keys contract).

### Task 3.2.2: Deletion cascade + token revocation
**Files:** Modify `app/main.py` (delete endpoint); Test `tests/test_dsar.py`
- [ ] Cascade via existing `ON DELETE CASCADE`; revokes stored integration tokens.
- [ ] **Proof tests (repository level):** `test_delete_removes_memories_messages_rules`;
  `test_delete_revokes_integration_tokens`.

### Task 3.2.3: Memory viewer (frontend slice 3)
**Files:** Create `frontend/src/components/MemoryView.tsx` + `.css` + `.test.tsx`; new
`list_memories` (read_only, user-scoped, confirmed) + `archive_memory` actions + tests
- [ ] Searchable list of confirmed memories with provenance (source, confidence, dates) and
  per-memory archive.
- [ ] **Proof tests:** backend `test_list_memories_confirmed_only_scoped`,
  `test_archive_flips_status`; vitest `renders provenance fields`, `search filters list`,
  `archive removes card`.

## F3.3 EU production hosting + durable jobs

### Task 3.3.1: `DurableRunner` (arq + Redis)
**Files:** Create `app/background_arq.py`; Modify `app/background.py` factory, `requirements.txt`;
Test `tests/test_durable_runner.py`
- [ ] Implements the existing `TaskRunner` protocol; swap is config-only; `InProcessRunner`
  stays dev default; extraction/sync/scheduler jobs survive process restart (arq persistence).
- [ ] **Proof tests:** `test_durable_runner_satisfies_protocol` (mypy/isinstance);
  `test_factory_selects_by_config`; integration (compose, marked `@pytest.mark.integration`):
  enqueue → kill worker → restart → job completes.

### Task 3.3.2: Health/readiness + log hygiene
**Files:** Modify `app/main.py`; Test `tests/test_health.py`
- [ ] `/health/ready` covers DB, Redis, Langdock reachability; structured logs contain **no
  message content or memory text**.
- [ ] **Proof tests:** `test_ready_degrades_per_dependency` (fake failing dep → component
  status); `test_logs_scrub_content` (log capture during a chat turn: user text absent).

### Task 3.3.3: EU deploy + fail-closed smoke
**Files:** Create `deploy/` (compose/Terraform for the chosen EU provider — decide and append
to DECISIONS.md), CI workflow
- [ ] TLS, backups, migration-on-deploy; CI smoke test asserts `DEV_AUTH_BYPASS` refused and
  `effective_scan_mode='mock'` guards hold **in the prod environment config**.
- [ ] **Proof:** CI job `prod-guards-smoke` red if either guard regresses; deploy documented
  in DECISIONS.md as a new numbered decision.

## F3.4 Teams bot (second surface)

### Task 3.4.1: Bot endpoint → same brain
**Files:** Create `app/surfaces/teams.py`; Test `tests/test_teams_surface.py`
- [ ] Bot Framework activity → map Teams identity → `entra_oid` → same user; messages go
  through `handle_turn` with **zero orchestrator changes** (thin client, Decision #2).
- [ ] **Proof tests:** `test_activity_maps_to_existing_user`;
  `test_turn_flows_through_handle_turn` (fake port observes the call);
  `test_web_and_teams_share_one_thread` (message logged via Teams visible in `/chat/history`).

### Task 3.4.2: Briefing channel choice
**Files:** Modify `app/proactive/scheduler.py`, rule schema (`channel` column, migration)
- [ ] Channel lives on the proactive rule; Teams delivery when enabled; web fallback.
- [ ] **Proof tests:** `test_rule_channel_routes_to_teams_adapter` (fake adapter);
  `test_web_fallback_when_teams_unavailable`.

---

# Phase 4 — v2 backlog (not scheduled; anchor tests noted)

- **Retrieval v2:** fixed eval set of (query → expected memory) pairs; recall@k measured
  before/after; reranker ships only if it beats deterministic fusion. *(Proof = the eval
  harness itself, `tests/eval_retrieval.py`.)*
- **Streaming replies (SSE):** proof = a client test asserting first token < full reply time
  and tool-round boundaries render.
- **Coaching content in proactive slots:** confidence-gated (Decision #12); proof = gate test
  (low confidence → informational only).
- **Cross-user scope promotion:** blocked on PRIVACY.md legal gate — no tasks until cleared.
- **Action ecosystem (`snooze_task`, `create_project`, weekly review):** each one `@action` +
  provenance/scoping tests; automatically on all four surfaces.

---

## Definition of Done (per feature)

1. Feature branch; spec + full plan committed under `docs/superpowers/`.
2. All the feature's proof tests written first and passing; full backend suite
   (`python -m pytest -q`) and frontend gate green.
3. Task-level review + final whole-branch review clean; ff-merge to main.
4. DECISIONS.md appended if an architectural choice was made; PRIVACY.md updated if a legal
   gate was touched.

## Self-review (against ROADMAP.md)

- Every roadmap acceptance criterion maps to a named proof test above — checked line-by-line
  for F0.1–F3.4; Phase-4 items carry anchor tests as the roadmap specifies.
- Dependency edges preserved: F0.1→F2.4, F0.3→F1.2, F2.1→F2.2, F1.1→F3.4.
- Interfaces referenced verbatim from code as of c2d771b: `ActionContext.initiator`,
  `is_agent_tool`, `_task_provenance`, `ChatPort.load_context/log_message/extract_memories`,
  `compose_*` composers, `required_keys/is_complete`, `TaskRunner`, `effective_scan_mode`,
  `users.onboarded_at`, `proactive_rules.send_time/timezone/weekdays/last_fired_at`,
  `memory_status` enum.
