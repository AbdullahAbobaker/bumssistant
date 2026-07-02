# Design: Frontend realign to chat-first — Slice 1 (shell)

**Date:** 2026-07-02
**Status:** Approved (brainstorming) — ready for implementation plan
**Relates to:** the UI plan (docs/design/2026-07-02-ui-plan-ambient-glassmorphism.md); Decisions
#2 (web app, chat-first), #4 (React+TS). Frontend-only — no backend changes.

## Goal

Realign the externally-built frontend from a generic widget **dashboard** to the approved
**chat-first** shape: the rail nav actually switches views, Chat is the full hero surface, the
HR-widget dashboard is retired, and glass surfaces pass 4.5:1. Memory/Review/Settings are
on-brand empty-states (their real content is later slices). No backend changes.

## Scope (this slice)

IN: view routing, chat-as-hero, retire the dashboard, scrim/contrast fix, empty-states, tests.
OUT (later slices): Review panel (needs backend `list_proposed_memories` + confirm), Memory
viewer (needs `list_memories`), Onboarding first-run flow. Backend untouched.

## Decisions (settled in brainstorming)

- **No router library** — a `view` state + `switch` (plain conditional render). YAGNI for a
  4-view SPA; a real router (deep links) can come with the later data slices.
- **Retire the widget dashboard** — delete the drift, keep `ChatWidget`.
- **Bake the scrim into the glass tiers** — one CSS change guarantees the plan's #1 rule
  (legibility over any backdrop) everywhere.

## Architecture

### 1. App shell + routing (`src/App.tsx`)

- Replace `activeNav`/`userDashboardConfig`/`renderWidget` with a single
  `const [view, setView] = useState<View>('chat')`, `type View = 'chat' | 'memory' | 'review' | 'settings'`.
- Rail nav items (Chat / Memory / Review / Settings) call `setView(id)`; active item keeps the
  `active` class + `aria-current="page"` (already correct).
- Main area renders the active view via a `switch(view)`:
  - `chat` → `<ChatView />` (the promoted ChatWidget, full surface)
  - `memory` | `review` | `settings` → `<EmptyState … />`
- Keep `<AmbientBackdrop />` and the `.app-shell` / `.rail` structure.

### 2. Chat as hero (`src/components/ChatView.tsx` or reuse `ChatWidget`)

Render the existing `ChatWidget` full-bleed in the main area (not inside `.dashboard-grid`).
No behavior change — it already does `POST /chat` with the `{message}`→`{reply}` contract.
The grid wrapper/`col-span` classes are removed; the chat fills `app-main`.

### 3. EmptyState (`src/components/EmptyState.tsx`)

Small glass component: an icon + title + one line ("Kommt bald…"), on-brand (glass-2, soft
radius). Props: `{ title: string; hint?: string }`. Used for Memory/Review/Settings.

### 4. Retire the dashboard

Delete: `DashboardSettingsModal.{tsx,css,test.tsx}`, `TopNav.{tsx,css}`,
`WelcomeHeader.{tsx,css}`, `config/widgetRegistry.ts`, and the HR widgets
`widgets/{CalendarWidget,DynamicStatWidget,DynamicListWidget,ProfileCard,ProgressWidget,TaskWidget}.{tsx,css,test.tsx}`.
Keep `widgets/ChatWidget.{tsx,test.tsx}`. Remove the now-dead `.dashboard-grid`/`.col-span-*`
CSS from `App.css`. (This removes ~most of the widget code — it is the off-product drift.)

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
:8000) → reply. Nav is pure client state; Memory/Review/Settings render static empty-states
(no fetch this slice).

## Error handling

No new network paths. ChatWidget's existing error toast is retained. An unknown `view` value
can't occur (typed union); the `switch` has a default returning the chat view.

## Testing (frontend vitest, DB-free)

1. App renders the **Chat view by default** (composer / "Nachricht" input present).
2. Clicking **Memory** (rail) switches to the Memory empty-state and the composer is gone;
   clicking **Chat** returns to the composer.
3. `EmptyState` renders its `title`.
4. Existing `ChatWidget` test unchanged and passing.
5. `npm run build` (tsc + vite) and `vitest` both green; no references to deleted modules remain.

## Out of scope

Review/Memory/Onboarding content + their backend actions; a routing library / deep links;
self-hosting Inter (separate DSGVO follow-up); the Settings backdrop-selector (future).
