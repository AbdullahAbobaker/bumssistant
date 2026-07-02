# Design: Frontend realign to chat-first — Slice 1 (shell + dashboard sidebar)

**Date:** 2026-07-02
**Status:** Approved (brainstorming) — ready for implementation plan
**Relates to:** the UI plan (docs/design/2026-07-02-ui-plan-ambient-glassmorphism.md); Decisions
#2 (web app, chat-first), #4 (React+TS), #8/#17 (proposed→confirm memory). Frontend-only.

## Goal

Realign the externally-built frontend so the rail nav actually switches views and Chat is the
hero surface — **while keeping the glass dashboard look the user likes**. The Chat view is a
two-column glass layout: `ChatWidget` as the full-height hero on the left, a compact,
BumFlow-relevant widget sidebar on the right. Memory/Review/Settings are on-brand empty-states
(their real content is later slices). Glass surfaces pass 4.5:1. No backend changes.

## Scope (this slice)

IN: view routing, chat-as-hero + dashboard sidebar, retire the *unused* dashboard machinery,
scrim/contrast fix, empty-states, tests.
OUT (later slices): Review panel (needs backend `list_proposed_memories` + confirm), Memory
viewer (needs `list_memories`), Onboarding first-run flow. Backend untouched.

## Decisions (settled in brainstorming)

- **Keep the dashboard look, chat-first** (Option B) — the glass grid feel stays; it becomes the
  sidebar beside the chat hero, not a standalone HR dashboard and not deleted.
- **Clean, BumFlow-relevant sidebar** (Option C + A) — 3 widgets: profile/greeting, today's
  focus, proposed-memories teaser. Drop the mock HR widgets (calendar, team roster, progress).
- **No router library** — a `view` state + `switch` (plain conditional render). YAGNI for a
  4-view SPA; a real router (deep links) can come with the later data slices.
- **Bake the scrim into the glass tiers** — one CSS change guarantees the plan's #1 rule
  (legibility over any backdrop) everywhere.

## Architecture

### 1. App shell + routing (`src/App.tsx`)

- Replace `activeNav`/`userDashboardConfig`/`renderWidget`/settings-modal state with a single
  `const [view, setView] = useState<View>('chat')`, `type View = 'chat' | 'memory' | 'review' | 'settings'`.
- Rail nav items (Chat / Memory / Review / Settings) call `setView(id)`; active item keeps the
  `active` class + `aria-current="page"` (already correct).
- Main area renders the active view via a `switch(view)`:
  - `chat` → `<ChatView />` (hero + sidebar, below)
  - `memory` | `review` | `settings` → `<EmptyState … />`
- Keep `<AmbientBackdrop />` and the `.app-shell` / `.rail` structure. Remove `TopNav` and the
  settings-modal wiring from the shell.

### 2. Chat view = hero + sidebar (`src/components/ChatView.tsx`)

Two-column glass layout inside `.app-main`:
- **Left (hero):** the existing `ChatWidget`, full-height. No behavior change — it already does
  `POST /chat` with the `{message}`→`{reply}` contract.
- **Right (sidebar):** a compact vertical stack of 3 widgets:
  1. **Profile / greeting** — reuse `ProfileCard`; a German time-of-day greeting (e.g.
     "Guten Morgen"). Static/placeholder props this slice.
  2. **Today's focus** — reuse `TaskWidget` with a couple of placeholder tasks.
  3. **Proposed memories teaser** — small glass card: a count + label
     ("2 Vorschläge zur Bestätigung") rendered as a link/button that switches the view to
     `review`. Ties to Decisions #8/#17. Implemented as a new small `ProposedMemoriesTeaser`
     component (placeholder count this slice; wires to `list_proposed_memories` in Slice 2).

Layout uses the existing glass classes; the old `.dashboard-grid`/`col-span-*` machinery is
removed in favor of a simple `ChatView`-local flex/grid (hero + fixed-width sidebar, sidebar
collapses/stacks under the hero on narrow widths).

### 3. EmptyState (`src/components/EmptyState.tsx`)

Small glass component: an icon + title + one line ("Kommt bald…"), on-brand (glass-2, soft
radius). Props: `{ title: string; hint?: string }`. Used for Memory/Review/Settings.

### 4. Retire the unused dashboard machinery

Delete: `DashboardSettingsModal.{tsx,css,test.tsx}`, `TopNav.{tsx,css}`,
`WelcomeHeader.{tsx,css}`, `config/widgetRegistry.ts`, and the now-unused HR widgets
`widgets/{CalendarWidget,DynamicListWidget,ProgressWidget}.{tsx,css,test.tsx}`.
**Keep:** `widgets/ChatWidget`, `widgets/ProfileCard`, `widgets/TaskWidget`,
`widgets/DynamicStatWidget` (the teaser may reuse it), + their tests.
Remove the now-dead `.dashboard-grid`/`.col-span-*` CSS from `App.css`.

### 5. Scrim/contrast fix (`src/index.css`)

Layer the navy scrim under each glass tier so text clears 4.5:1 on any backdrop, e.g.:
```css
.glass-1 { background: linear-gradient(var(--scrim), var(--scrim)), var(--glass-1); … }
.glass-2, .glass { background: linear-gradient(var(--scrim), var(--scrim)), var(--glass-2); … }
.glass-3 { background: linear-gradient(var(--scrim), var(--scrim)), var(--glass-3); … }
```
(`--scrim` = `rgba(15,23,42,0.60)`.) The `@supports not (backdrop-filter)` opaque fallback stays.
`--fg`/`--fg-muted` text on these now meets contrast regardless of the ambient gradient.

## Data flow

Unchanged from today for chat: user → `ChatView`(ChatWidget) → `POST /chat` (vite proxy →
:8000) → reply. Nav is pure client state. Sidebar widgets render static/placeholder data this
slice (no fetch); the proposed-memories teaser's click calls `setView('review')`.

## Error handling

No new network paths. ChatWidget's existing error toast is retained. An unknown `view` value
can't occur (typed union); the `switch` has a default returning the chat view.

## Testing (frontend vitest, DB-free)

1. App renders the **Chat view by default** — composer / "Nachricht" input present **and** the
   sidebar widgets (profile, today's focus, proposed-memories teaser) present.
2. Clicking **Memory** (rail) switches to the Memory empty-state and the composer is gone;
   clicking **Chat** returns to the composer.
3. `EmptyState` renders its `title`.
4. The proposed-memories teaser renders its count/label and, when clicked, switches to the
   Review view.
5. Existing `ChatWidget` test unchanged and passing.
6. `npm run build` (tsc + vite) and `vitest` both green; no references to deleted modules remain.

## Out of scope

Review/Memory/Onboarding content + their backend actions; a routing library / deep links;
self-hosting Inter (separate DSGVO follow-up); real data for the sidebar widgets (placeholder
this slice; wired in later slices).
