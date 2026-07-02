# Frontend Chat-First Realign — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rail nav actually switch views, promote Chat to a hero surface with a clean BumFlow-relevant dashboard sidebar, retire the unused HR-dashboard machinery, and fix glass contrast — frontend-only.

**Architecture:** A single `view` state in `App.tsx` drives a `switch` (no router). The `chat` view renders a new `ChatView` (two-column glass: `ChatWidget` hero + a sidebar of `ProfileCard` / `TaskWidget` / a new `ProposedMemoriesTeaser`). `memory`/`review`/`settings` render a new `EmptyState`. The navy scrim is baked into `.glass-1/2/3` for 4.5:1 legibility.

**Tech Stack:** Vite + React 19 + TypeScript, vitest + @testing-library/react (jsdom), tsc + vite build. Node 22.

## Global Constraints

- Frontend-only — **no backend changes**, no new network calls this slice.
- UI/output language is **German** (all user-visible copy).
- **No new dependencies** — no router library; plain `useState` + `switch`.
- **No Google Fonts / external hotlinks** (DSGVO) — do not re-add any `@import url(...)`.
- Every new component ships with a DB-free vitest test in the same directory.
- Run from `frontend/`: tests `npm run test -- --run`, build `npm run build`, lint `npm run lint`.
- All three (test, build, lint) must be green at the end of each task that changes code.

---

### Task 1: Bake the scrim into the glass tiers

**Files:**
- Modify: `frontend/src/index.css:131-147` (the `.glass-1` / `.glass-2, .glass` / `.glass-3` rules)

**Interfaces:**
- Consumes: `--scrim` (already defined `rgba(15, 23, 42, 0.60)` at `index.css:15`), `--glass-1/2/3`.
- Produces: no JS surface. `.glass-1/2/3` now render an opaque navy scrim under the translucent tint so `--fg`/`--fg-muted` text clears 4.5:1 on any ambient backdrop.

- [ ] **Step 1: Layer the scrim under each glass tier**

Replace the three `background:` lines only (leave `backdrop-filter`, borders untouched):

```css
.glass-1 {
  background: linear-gradient(var(--scrim), var(--scrim)), var(--glass-1);
  backdrop-filter: blur(var(--glass-blur)) saturate(130%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(130%);
  border: 1px solid var(--glass-border);
}
.glass-2, .glass {
  background: linear-gradient(var(--scrim), var(--scrim)), var(--glass-2);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  border: 1px solid var(--glass-border);
}
.glass-3 {
  background: linear-gradient(var(--scrim), var(--scrim)), var(--glass-3);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
```

Leave `.glass-dark` and the `@supports not (backdrop-filter)` opaque fallback (`index.css:157-161`) exactly as they are.

- [ ] **Step 2: Verify the scrim is present**

Run: `cd frontend && grep -c "linear-gradient(var(--scrim), var(--scrim))" src/index.css`
Expected: `3`

- [ ] **Step 3: Verify the build still compiles**

Run: `cd frontend && npm run build`
Expected: exits 0 (tsc + vite), no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "fix(ui): bake navy scrim into glass tiers for 4.5:1 contrast"
```

---

### Task 2: EmptyState component

**Files:**
- Create: `frontend/src/components/EmptyState.tsx`
- Create: `frontend/src/components/EmptyState.css`
- Test: `frontend/src/components/EmptyState.test.tsx`

**Interfaces:**
- Produces: `export function EmptyState(props: { title: string; hint?: string }): JSX.Element`. Renders a centered glass-2 card with the `title` as an `<h2>` and `hint` (default `'Kommt bald…'`) as a `<p>`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/EmptyState.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EmptyState } from './EmptyState'

test('renders the title', () => {
  render(<EmptyState title="Memory" />)
  expect(screen.getByText('Memory')).toBeInTheDocument()
})

test('renders the default hint when none given', () => {
  render(<EmptyState title="Review" />)
  expect(screen.getByText('Kommt bald…')).toBeInTheDocument()
})

test('renders a custom hint', () => {
  render(<EmptyState title="Settings" hint="Bald verfügbar" />)
  expect(screen.getByText('Bald verfügbar')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/components/EmptyState.test.tsx`
Expected: FAIL — cannot resolve `./EmptyState`.

- [ ] **Step 3: Write the CSS**

```css
/* frontend/src/components/EmptyState.css */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  margin: 24px;
  padding: 48px 32px;
  border-radius: var(--radius-lg);
  color: var(--fg-muted);
}

.empty-state h2 {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--fg);
  letter-spacing: -0.02em;
}

.empty-state p {
  font-size: 0.875rem;
  line-height: 1.6;
  max-width: 280px;
}
```

- [ ] **Step 4: Write the component**

```tsx
// frontend/src/components/EmptyState.tsx
import './EmptyState.css'

export interface EmptyStateProps {
  title: string
  hint?: string
}

export function EmptyState({ title, hint = 'Kommt bald…' }: EmptyStateProps) {
  return (
    <div className="empty-state glass-2">
      <h2>{title}</h2>
      <p>{hint}</p>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run src/components/EmptyState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/EmptyState.tsx frontend/src/components/EmptyState.css frontend/src/components/EmptyState.test.tsx
git commit -m "feat(ui): add EmptyState glass component"
```

---

### Task 3: ProposedMemoriesTeaser widget

**Files:**
- Create: `frontend/src/components/widgets/ProposedMemoriesTeaser.tsx`
- Create: `frontend/src/components/widgets/ProposedMemoriesTeaser.css`
- Test: `frontend/src/components/widgets/ProposedMemoriesTeaser.test.tsx`

**Interfaces:**
- Produces: `export function ProposedMemoriesTeaser(props: { count: number; onReview: () => void }): JSX.Element`. Renders a glass card with the count and the German label `"<count> Vorschläge zur Bestätigung"`, as a single `<button>` that calls `onReview` when clicked. Ties to Decisions #8/#17 (placeholder count this slice; wired to `list_proposed_memories` in Slice 2).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/widgets/ProposedMemoriesTeaser.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ProposedMemoriesTeaser } from './ProposedMemoriesTeaser'

test('renders the count and German label', () => {
  render(<ProposedMemoriesTeaser count={2} onReview={() => {}} />)
  expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
})

test('calls onReview when clicked', () => {
  const onReview = vi.fn()
  render(<ProposedMemoriesTeaser count={2} onReview={onReview} />)
  fireEvent.click(screen.getByRole('button', { name: /Vorschläge/ }))
  expect(onReview).toHaveBeenCalledOnce()
})
```

(`fireEvent` is used, not `@testing-library/user-event`, which is intentionally not a dependency.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/components/widgets/ProposedMemoriesTeaser.test.tsx`
Expected: FAIL — cannot resolve `./ProposedMemoriesTeaser`.

- [ ] **Step 4: Write the CSS**

```css
/* frontend/src/components/widgets/ProposedMemoriesTeaser.css */
.memories-teaser {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  font-family: var(--font);
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease;
}

.memories-teaser:hover {
  background: var(--control-inactive);
}

.memories-teaser-count {
  font-size: 1.75rem;
  font-weight: 300;
  line-height: 1;
  color: var(--accent);
  flex-shrink: 0;
}

.memories-teaser-label {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--fg-muted);
}
```

- [ ] **Step 5: Write the component**

```tsx
// frontend/src/components/widgets/ProposedMemoriesTeaser.tsx
import './ProposedMemoriesTeaser.css'

export interface ProposedMemoriesTeaserProps {
  count: number
  onReview: () => void
}

export function ProposedMemoriesTeaser({ count, onReview }: ProposedMemoriesTeaserProps) {
  return (
    <button className="memories-teaser glass-2" onClick={onReview}>
      <span className="memories-teaser-count">{count}</span>
      <span className="memories-teaser-label">{count} Vorschläge zur Bestätigung</span>
    </button>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run src/components/widgets/ProposedMemoriesTeaser.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/widgets/ProposedMemoriesTeaser.tsx frontend/src/components/widgets/ProposedMemoriesTeaser.css frontend/src/components/widgets/ProposedMemoriesTeaser.test.tsx
git commit -m "feat(ui): add ProposedMemoriesTeaser widget"
```

---

### Task 4: ChatView (hero + sidebar)

**Files:**
- Create: `frontend/src/components/ChatView.tsx`
- Create: `frontend/src/components/ChatView.css`
- Test: `frontend/src/components/ChatView.test.tsx`

**Interfaces:**
- Consumes: `ChatWidget` (`../components/widgets/ChatWidget`, no props), `ProfileCard` (`./widgets/ProfileCard`, no props), `TaskWidget` (`./widgets/TaskWidget`, optional `tasks`), `ProposedMemoriesTeaser` (`./widgets/ProposedMemoriesTeaser`, `{count, onReview}`).
- Produces:
  - `export function germanGreeting(hour: number): string` — pure: `5–11 → 'Guten Morgen'`, `12–17 → 'Guten Tag'`, `18–22 → 'Guten Abend'`, else `'Gute Nacht'`.
  - `export function ChatView(props: { onReviewClick: () => void }): JSX.Element` — two-column layout: `ChatWidget` hero left, sidebar right (greeting `<h2>`, `ProfileCard`, `TaskWidget`, `ProposedMemoriesTeaser count={2} onReview={onReviewClick}`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/ChatView.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, test, describe } from 'vitest'
import { ChatView, germanGreeting } from './ChatView'

describe('germanGreeting', () => {
  test('maps hours to German greetings', () => {
    expect(germanGreeting(8)).toBe('Guten Morgen')
    expect(germanGreeting(14)).toBe('Guten Tag')
    expect(germanGreeting(20)).toBe('Guten Abend')
    expect(germanGreeting(3)).toBe('Gute Nacht')
  })
})

describe('ChatView', () => {
  test('renders the chat composer and the sidebar widgets', () => {
    render(<ChatView onReviewClick={() => {}} />)
    expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()      // ChatWidget composer
    expect(screen.getByText('Nutzerprofil')).toBeInTheDocument()        // ProfileCard
    expect(screen.getByText('Aufgaben')).toBeInTheDocument()            // TaskWidget
    expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument() // teaser
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/components/ChatView.test.tsx`
Expected: FAIL — cannot resolve `./ChatView`.

- [ ] **Step 3: Write the CSS**

```css
/* frontend/src/components/ChatView.css */
.chat-view {
  flex: 1;
  display: flex;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
  min-height: 0;
}

.chat-view-hero {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.chat-view-sidebar {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.chat-view-greeting {
  font-size: 1.25rem;
  font-weight: 300;
  letter-spacing: -0.02em;
  color: var(--fg);
  padding: 4px 2px;
}

/* Stack the sidebar under the hero on narrow viewports */
@media (max-width: 900px) {
  .chat-view {
    flex-direction: column;
    overflow-y: auto;
  }
  .chat-view-sidebar {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 4: Write the component**

```tsx
// frontend/src/components/ChatView.tsx
import './ChatView.css'
import { ChatWidget } from './widgets/ChatWidget'
import { ProfileCard } from './widgets/ProfileCard'
import { TaskWidget } from './widgets/TaskWidget'
import { ProposedMemoriesTeaser } from './widgets/ProposedMemoriesTeaser'

export function germanGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Guten Morgen'
  if (hour >= 12 && hour < 18) return 'Guten Tag'
  if (hour >= 18 && hour < 23) return 'Guten Abend'
  return 'Gute Nacht'
}

export interface ChatViewProps {
  onReviewClick: () => void
}

export function ChatView({ onReviewClick }: ChatViewProps) {
  const greeting = germanGreeting(new Date().getHours())
  return (
    <div className="chat-view">
      <div className="chat-view-hero">
        <ChatWidget />
      </div>
      <aside className="chat-view-sidebar" aria-label="Übersicht">
        <h2 className="chat-view-greeting">{greeting}</h2>
        <ProfileCard />
        <TaskWidget />
        <ProposedMemoriesTeaser count={2} onReview={onReviewClick} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run src/components/ChatView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatView.tsx frontend/src/components/ChatView.css frontend/src/components/ChatView.test.tsx
git commit -m "feat(ui): add ChatView hero + BumFlow sidebar"
```

---

### Task 5: Rewire App shell to view-routing

**Files:**
- Modify: `frontend/src/App.tsx` (full rewrite of the component body — replace dashboard state/render)
- Modify: `frontend/src/App.test.tsx` (rewrite for the new shell)
- Modify: `frontend/src/App.css` — delete the dead `.dashboard-grid`, `.widget-wrapper`, `.col-span-*`, `.row-span-*`, `.top-bar*`, `.status-dot` rules (`App.css:99-163`). Keep `.app-shell`, `.rail*`, `.app-main`, `.chat-*`, `.message*`, `.composer*`, `.error-toast`, keyframes, and the responsive block.

**Interfaces:**
- Consumes: `ChatView` (`./components/ChatView`, `{onReviewClick}`), `EmptyState` (`./components/EmptyState`, `{title, hint?}`).
- Produces: default-export `App`. Internal `type View = 'chat' | 'memory' | 'review' | 'settings'`, `const [view, setView] = useState<View>('chat')`. No more `activeNav`, `userDashboardConfig`, `renderWidget`, `isSettingsOpen`, or any widgetRegistry/DashboardSettingsModal/TopNav import.

- [ ] **Step 1: Write the failing test (rewrite App.test.tsx)**

```tsx
// frontend/src/App.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import userEvent from '@testing-library/user-event'
import App from './App'

test('renders the Chat view by default (composer + sidebar)', () => {
  render(<App />)
  expect(screen.getByLabelText('BumFlow')).toBeInTheDocument()          // rail logo
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()        // chat composer
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()              // sidebar TaskWidget
  expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
})

test('rail nav switches to Memory empty-state and back to Chat', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Memory' }))
  expect(screen.getByText('Memory')).toBeInTheDocument()                // empty-state title
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()  // composer gone

  await userEvent.click(screen.getByRole('button', { name: 'Chat' }))
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()        // composer back
})

test('proposed-memories teaser navigates to the Review view', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /Vorschläge/ }))
  expect(screen.getByText('Review')).toBeInTheDocument()                // Review empty-state title
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()
})
```

(If `@testing-library/user-event` did not resolve in Task 3, use `fireEvent.click(...)` from `@testing-library/react` here too — same substitution.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run src/App.test.tsx`
Expected: FAIL — App still renders the dashboard; nav buttons don't switch views (e.g. clicking Memory leaves the composer present).

- [ ] **Step 3: Rewrite `App.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import type { JSX } from 'react'
import './App.css'
import { ChatView } from './components/ChatView'
import { EmptyState } from './components/EmptyState'

type View = 'chat' | 'memory' | 'review' | 'settings'

// ── Icons (inline SVG, Lucide-style) ────────────────
const Icons = {
  Chat: () => (
    <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  ),
  Brain: () => (
    <svg viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.66Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.66Z"/></svg>
  ),
  CheckSquare: () => (
    <svg viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
}

const NAV_ITEMS: { id: View; label: string; Icon: () => JSX.Element }[] = [
  { id: 'chat',     label: 'Chat',     Icon: Icons.Chat },
  { id: 'memory',   label: 'Memory',   Icon: Icons.Brain },
  { id: 'review',   label: 'Review',   Icon: Icons.CheckSquare },
  { id: 'settings', label: 'Settings', Icon: Icons.Settings },
]

function AmbientBackdrop() {
  return <div className="ambient-backdrop" aria-hidden="true" />
}

export default function App() {
  const [view, setView] = useState<View>('chat')

  const renderView = () => {
    switch (view) {
      case 'memory':   return <EmptyState title="Memory" />
      case 'review':   return <EmptyState title="Review" />
      case 'settings': return <EmptyState title="Settings" />
      case 'chat':
      default:         return <ChatView onReviewClick={() => setView('review')} />
    }
  }

  return (
    <>
      <AmbientBackdrop />

      <div className="app-shell">
        {/* ── Left Rail ── */}
        <nav className="rail glass-1" aria-label="Hauptnavigation">
          <div className="rail-logo" aria-label="BumFlow">BF</div>
          <div className="rail-nav">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`nav-${id}`}
                className={`rail-item ${view === id ? 'active' : ''}`}
                onClick={() => setView(id)}
                aria-label={label}
                aria-current={view === id ? 'page' : undefined}
                title={label}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ── Main content ── */}
        <main className="app-main">
          {renderView()}
        </main>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Remove dead dashboard CSS from `App.css`**

Delete the rule blocks for `.dashboard-grid`, `.widget-wrapper`, `.widget-wrapper > *`, `.col-span-1/2/3/full`, `.row-span-1/2/3`, `.top-bar`, `.top-bar-title`, `.top-bar-subtitle`, and `.status-dot` (the contiguous span at `App.css:99-163`). Leave everything else intact.

- [ ] **Step 5: Run the App tests + full suite**

Run: `cd frontend && npm run test -- --run`
Expected: `src/App.test.tsx` PASSES (3 tests). NOTE: tests for deleted widgets (Calendar/DynamicList/Progress) and DashboardSettingsModal still exist and will FAIL to import at this point — that is expected and resolved in Task 6. All *non-deleted* suites pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/App.css
git commit -m "feat(ui): rail nav switches views; chat is the hero"
```

---

### Task 6: Retire the unused dashboard machinery

**Files:**
- Delete: `frontend/src/components/DashboardSettingsModal.tsx`, `.css`, `.test.tsx`
- Delete: `frontend/src/components/TopNav.tsx`, `.css`
- Delete: `frontend/src/components/WelcomeHeader.tsx`, `.css`
- Delete: `frontend/src/config/widgetRegistry.ts`
- Delete: `frontend/src/components/widgets/CalendarWidget.tsx`, `.css`, `.test.tsx`
- Delete: `frontend/src/components/widgets/DynamicListWidget.tsx`, `.css`, `.test.tsx`
- Delete: `frontend/src/components/widgets/ProgressWidget.tsx`, `.css`, `.test.tsx`

**Interfaces:**
- Consumes/Produces: nothing. Kept: `ChatWidget`, `ProfileCard`, `TaskWidget`, `DynamicStatWidget` (+ their tests). These four have no remaining imports of the deleted files.

- [ ] **Step 1: Confirm nothing still imports the doomed modules**

Run:
```bash
cd frontend && grep -rn -E "widgetRegistry|DashboardSettingsModal|TopNav|WelcomeHeader|CalendarWidget|DynamicListWidget|ProgressWidget" src --include=*.tsx --include=*.ts | grep -v -E "CalendarWidget\.(tsx|css|test\.tsx)|DynamicListWidget\.(tsx|css|test\.tsx)|ProgressWidget\.(tsx|css|test\.tsx)|DashboardSettingsModal\.(tsx|css|test\.tsx)|TopNav\.(tsx|css)|WelcomeHeader\.(tsx|css)|widgetRegistry\.ts"
```
Expected: **no output** (the only references are the files' own definitions/tests, which we're deleting). If any other file references them, stop and fix that reference first.

- [ ] **Step 2: Delete the files**

```bash
cd frontend
git rm src/components/DashboardSettingsModal.tsx src/components/DashboardSettingsModal.css src/components/DashboardSettingsModal.test.tsx \
       src/components/TopNav.tsx src/components/TopNav.css \
       src/components/WelcomeHeader.tsx src/components/WelcomeHeader.css \
       src/config/widgetRegistry.ts \
       src/components/widgets/CalendarWidget.tsx src/components/widgets/CalendarWidget.css src/components/widgets/CalendarWidget.test.tsx \
       src/components/widgets/DynamicListWidget.tsx src/components/widgets/DynamicListWidget.css src/components/widgets/DynamicListWidget.test.tsx \
       src/components/widgets/ProgressWidget.tsx src/components/widgets/ProgressWidget.css src/components/widgets/ProgressWidget.test.tsx
```

- [ ] **Step 3: Verify no dangling references remain**

Run:
```bash
cd frontend && grep -rn -E "widgetRegistry|DashboardSettingsModal|TopNav|WelcomeHeader|CalendarWidget|DynamicListWidget|ProgressWidget|WIDGET_DEFAULT_SIZES" src
```
Expected: **no output**.

- [ ] **Step 4: Full green gate — test, build, lint**

Run:
```bash
cd frontend && npm run test -- --run && npm run build && npm run lint
```
Expected: all pass. Test suites remaining: `App`, `ChatView`, `EmptyState`, `ChatWidget`, `ProfileCard`, `TaskWidget`, `DynamicStatWidget`, `ProposedMemoriesTeaser`. tsc+vite build exits 0. Lint clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(ui): retire unused HR-dashboard widgets and settings modal"
```

---

## Self-Review

**Spec coverage:**
- View routing (`view` state + `switch`) → Task 5. ✓
- Chat-as-hero + sidebar → Task 4 (ChatView) + Task 5 (wired as default view). ✓
- Sidebar = profile/greeting + today's focus + proposed-memories teaser → Task 4 (greeting + ProfileCard + TaskWidget) + Task 3 (teaser). ✓
- Teaser click → Review view → Task 5 (`onReviewClick={() => setView('review')}`) + tested. ✓
- Empty-states for Memory/Review/Settings → Task 2 + Task 5. ✓
- Scrim bake for 4.5:1 → Task 1. ✓
- Retire unused machinery, keep ChatWidget/ProfileCard/TaskWidget/DynamicStatWidget → Task 6. ✓
- All 6 spec test items covered across Tasks 2–6. ✓
- No backend changes, no new deps, German copy, no font hotlink → Global Constraints, honored throughout. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `germanGreeting(hour: number): string` and `ChatView({onReviewClick})` defined in Task 4, consumed in Task 5 with matching signature. `ProposedMemoriesTeaser({count, onReview})` defined Task 3, consumed in Task 4 (`count={2} onReview={onReviewClick}`). `EmptyState({title, hint?})` defined Task 2, consumed Task 5. `type View` consistent across App. ✓

**Note on DynamicStatWidget:** kept per spec (teaser "may reuse it") but the teaser was implemented as its own component for a cleaner click-to-navigate surface; DynamicStatWidget + its test remain in the tree unused-by-App, harmless, available for later slices.
