# F1.1 — Proactive Scheduler (backend firing engine) — Design

*Written 2026-07-07. Implements ROADMAP.md Phase 1, feature F1.1. Companion to
[DECISIONS.md](../../../DECISIONS.md) (#12 self-suppression, #17 single thread, #19 seams)
and [ROADMAP.md](../../ROADMAP.md).*

## Goal

Close the **initiative loop**: an APScheduler-driven engine that, for each confirmed
`proactive_rule` due now, calls the matching composer and — only when the composer returns
a message — writes a `role='briefing'` message into the user's persistent thread.

The composers (`app/proactive/engine.py`) and the `proactive_rules` schema
(`db/migrations/0002_proactive.sql`) already exist. This feature adds the scheduler that
fires them.

## Scope

**In scope (F1.1):** pure due-rule function, `Scheduler` seam + in-process APScheduler impl,
the per-tick orchestration, briefing-context assembly (sharing the chat "focus facts" query
to avoid drift), writing `role='briefing'` messages, and seeding default rules as
`status='proposed'` at onboarding completion.

**Out of scope (deferred to F1.2):** confirm/pause/edit rule actions
(`list_proactive_rules`, `update_proactive_rule`), the Settings management UI, and the
in-app unread-briefing delivery indicator. End-to-end `proposed → confirm → fires` therefore
spans F1.1 + F1.2; F1.1 is fully unit-testable on its own via directly-constructed confirmed
rules and a fake port.

## Decisions locked during brainstorming

1. **Fire mechanism: minute-tick poller.** One APScheduler interval job wakes every 60s and
   calls a pure `due_rules(rules, now_utc)` over all confirmed rules. The pure function is the
   heart; APScheduler is only "call `run_tick()` every minute." Rule edits need no job
   re-registration; the design self-heals after downtime. (Rejected: per-rule cron jobs —
   duplicates DB state into APScheduler, harder to test, must add/remove jobs on every edit.)
2. **Catch-up: fire late, same local day.** A rule is due iff local weekday ∈ mask AND local
   time ≥ `send_time` AND it has not already fired today (local). A morning briefing missed at
   08:00 due to downtime still delivers when the app returns that day; it never fires twice per
   local day, and a fully-missed day is not replayed the next day.
3. **Seed defaults as `ai_suggested`/`proposed`.** Onboarding seeds `morning_briefing 08:00`
   and `end_of_day_recap 17:00`, Mon–Fri, `Europe/Berlin`, with a `suggestion_reason`. No
   midday touchpoint by default. `source='ai_suggested'` (the user did not pick times);
   `status='proposed'` so confirmation (F1.2) is required before anything fires.

## Global constraints (per CLAUDE.md / ROADMAP.md)

- Every new module has pure, DB-free unit tests; `python -m pytest -q` green before merge.
- No module imports Langdock except `app/llm.py`. (The scheduler needs no LLM — composers are
  pure string builders.)
- Anything AI-inferred lands as `status='proposed'` (Decision #8 / #12). Seeded rules included.
- BumFlow output German-default (Decision #15). Composers already emit German.
- No `datetime.now()` / randomness inside pure functions — `now_utc` is always injected.

## Architecture

```
app lifespan startup
      │  starts
      ▼
Scheduler (Protocol)  ──impl──►  ApSchedulerRunner   ← only file that imports apscheduler
      │                              │ one AsyncIOScheduler interval job, every 60s
      │                              ▼
      │                         run_tick(port, now_utc)          ← orchestration, DB-free-testable
      │                              │
      │        ┌─────────────────────┼───────────────────────────┐
      ▼        ▼                     ▼                            ▼
 due_rules(rules, now)   port.confirmed_rules()   port.build_briefing_context(uid)   port.deliver()+mark_fired()
  (PURE, the heart)         (SQL)                    (SQL, shared focus facts)         (SQL)
      │
      ▼
 COMPOSERS[touchpoint](ctx)  → str | None   (existing app/proactive/engine.py, unchanged)
```

## Components

### 1. `app/proactive/schedule.py` (NEW — pure, the heart)

- `@dataclass(frozen=True) class RuleView`: `id: str`, `user_id: str`, `touchpoint: str`,
  `send_time: time`, `timezone: str`, `weekdays: tuple[int, ...]` (ISO 1=Mon..7=Sun),
  `last_fired_at: datetime | None`. A DB-free representation of one confirmed rule;
  `user_id` lets `run_tick` address the owner without a second query.
- `def is_due(rule: RuleView, now_utc: datetime) -> bool`:
  - Convert `now_utc` (tz-aware UTC) to the rule's timezone via `zoneinfo.ZoneInfo`.
  - Due iff: local ISO weekday ∈ `rule.weekdays` **and** local time ≥ `rule.send_time`
    **and** the rule has not fired today (local) — i.e. `last_fired_at` is `None`, or its
    value converted to the rule-local date is `< today_local`.
- `def due_rules(rules: Sequence[RuleView], now_utc: datetime) -> list[RuleView]`: filter by `is_due`.
- Pure: no DB, no `datetime.now()`. `now_utc` is injected by the caller.

### 2. `app/proactive/scheduler.py` (NEW — seam + orchestration)

- `class Scheduler(Protocol)`: `def start(self) -> None`, `def shutdown(self) -> None`.
- `class ProactivePort(Protocol)`:
  - `async def confirmed_rules(self) -> list[RuleView]`
  - `async def build_briefing_context(self, user_id: str) -> BriefingContext`
  - `async def deliver(self, user_id: str, content: str) -> None`
  - `async def mark_fired(self, rule_id: str, now_utc: datetime) -> None`
- `async def run_tick(port: ProactivePort, now_utc: datetime) -> None`:
  1. `rules = await port.confirmed_rules()`
  2. `for rule in due_rules(rules, now_utc):` — each iteration wrapped in `try/except`
     (best-effort; one user's failure never blocks others; logged with rule id / touchpoint,
     never content):
     - `ctx = await port.build_briefing_context(rule.user_id)`
     - `msg = COMPOSERS[rule.touchpoint](ctx)`
     - if `msg is None`: **write nothing, do not stamp `last_fired_at`** (suppression is a
       per-tick judgment on that day's data; it may become non-None later the same day).
     - else: `await port.deliver(rule.user_id, msg)` then `await port.mark_fired(rule.id, now_utc)`
       (mark only after successful delivery).
- `class ApSchedulerRunner(Scheduler)`: wraps `AsyncIOScheduler`; registers one interval job
  (60s) that calls `run_tick(self._port, datetime.now(timezone.utc))`. The **only** module
  that imports `apscheduler`.

### 3. `app/proactive/repository.py` (NEW — `DbProactivePort`)

`DbProactivePort(session_factory, chat_port)` implements `ProactivePort`:

- `confirmed_rules`: `SELECT id, user_id, touchpoint, send_time, timezone, weekdays,
  last_fired_at FROM proactive_rules WHERE status='confirmed'` (uses `idx_proactive_active`) →
  `RuleView`s.
- `build_briefing_context`: reuse the shared **focus-facts** helper (§4) + `open_blockers`
  from `memories WHERE type='blocker' AND status='confirmed'`. `meetings_today=[]` (calendar
  is Phase 2). `is_working_day=True` (weekday already gated by the rule mask, so the composer's
  own check is a harmless no-op). Split tasks into `overdue_tasks` (due_at local date < today)
  vs `tasks_due_today` (due_at local date == today).
- `deliver`: delegate to `DbChatPort.log_message(user_id, "briefing", content)` — the
  `'briefing'` `message_role` and the conversation upsert already exist; no new write path.
- `mark_fired`: `UPDATE proactive_rules SET last_fired_at=:now, updated_at=now() WHERE id=:rid`.

### 4. Refactor `app/chat/repository.py` (no-drift requirement)

Extract the currently-inline active-projects and dated-tasks queries in `load_context` into a
shared helper:

- `@dataclass FocusFacts`: `active_projects: list[str]`, `open_dated_tasks: list[tuple[str, datetime]]`
  (title, due_at) for open (`state IS NULL OR <> 'done'`) confirmed task memories with a
  `due_at`, up to end-of-today-local.
- `async def fetch_focus_facts(session, user_id) -> FocusFacts`.
- `load_context` calls it and preserves its **exact current output**: filters `due_at <= now`
  for the existing `compose_always_on` one-liner.
- `build_briefing_context` calls the same helper and shapes the rows differently (overdue vs
  due-today split). One SQL source, two shapers → no divergent query path.

### 5. Onboarding seeding — `app/onboarding/http.py` `POST /onboarding/complete`

Inside the existing first-completion path (which flips `onboarded_at` only when
`IS NULL`), insert default rules. A small pure builder returns the rows to insert:

- `def default_rules() -> list[SeedRule]` → `morning_briefing @ 08:00`, `end_of_day_recap @ 17:00`,
  each `weekdays=(1,2,3,4,5)`, `timezone='Europe/Berlin'`, `status='proposed'`,
  `source='ai_suggested'`, `suggestion_reason` (German).

The insert is guarded so it only runs when this call actually flips `onboarded_at`
(idempotent — a repeat `POST /complete` seeds nothing).

### 6. App wiring — `app/main.py`

Add a FastAPI `lifespan` handler: construct
`ApSchedulerRunner(DbProactivePort(SessionLocal, DbChatPort(SessionLocal, get_llm(settings))))`,
call `.start()` on startup and `.shutdown()` on shutdown. (The chat port is only used for its
`log_message`; the LLM instance it carries is never called by briefings.)

## Error handling

- Per-rule `try/except` in `run_tick`: best-effort, logged (rule id / user id / touchpoint
  only — **never** briefing content), one failure never blocks the rest.
- `mark_fired` runs only after a successful `deliver`. A delivery failure leaves
  `last_fired_at` unchanged so the next tick retries within the same day.
- Composer `None` → nothing written, `last_fired_at` untouched (re-evaluated next tick).
- Scheduler failures are fully isolated from the chat request path.

## Testing (all DB-free)

- `tests/test_schedule.py` — `is_due` / `due_rules`:
  - Berlin tz conversion on both sides of DST.
  - Weekday mask (in / out of mask).
  - `last_fired_at` same-local-day dedupe (does **not** fire twice).
  - Catch-up: down at `send_time`, `now` later same day, `last_fired_at` null/prior-day → fires.
  - Not-yet-time (local time < send_time) → not due.
  - `last_fired_at = None` → fires.
- `tests/test_scheduler_tick.py` — `run_tick` with a **fake `ProactivePort`**:
  - Composer → `None`: `deliver` and `mark_fired` never called.
  - Composer → text: `deliver` then `mark_fired`, in that order.
  - One rule's `build_briefing_context` raising does not stop later rules.
- Focus-facts shaping: pure test of the overdue-vs-due-today split over `open_dated_tasks`.
- Onboarding seeding: pure test of `default_rules()` (touchpoints, times, weekdays,
  `status='proposed'`, `source='ai_suggested'`). The SQL insert is exercised through the app.

## Acceptance criteria (from ROADMAP.md F1.1)

- [ ] Due-rule computation is a pure function with unit tests covering timezone, weekday mask,
      and `last_fired_at` dedupe (a slot never fires twice for the same local day).
- [ ] When a composer returns `None` (self-suppression, #12), **no message row is written** —
      verified by test.
- [ ] Briefing content is informational only (v1) and sourced from the same focus-facts data as
      chat — no separate query path to drift.
- [ ] Scheduler starts with the app, survives a rule being paused mid-flight, and one user's
      briefing failure never blocks others (best-effort per user, logged).
- [ ] Onboarding seeds default rules as `proposed`; user confirmation (F1.2) activates them.

## Dependencies / sequencing

- Uses the existing `'briefing'` `message_role` (F0.3 delivered it) and `DbChatPort.log_message`.
- Unblocks F1.2 (rule management + in-app delivery) and later F3.4 (Teams delivery channel).
- New runtime dependency: `apscheduler` (add to `requirements*.txt`).
