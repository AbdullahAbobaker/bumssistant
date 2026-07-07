# Onboarding Wizard ("Der erste Eindruck") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cinematic first-run onboarding wizard for the React frontend per `docs/superpowers/specs/2026-07-06-onboarding-wizard-design.md`, ending in a ChatView handoff where BumFlow's first message types in the chosen tone.

**Architecture:** Frontend-only. A fullscreen `OnboardingWizard` (5-step state machine over the existing ambient backdrop) is mounted by `App.tsx` when `GET /me` reports `onboarded === false`. Steps are pure UI components; the wizard owns all API calls through a small `api.ts` client that defines the backend contract (backend implementation is out of scope — it belongs to the "Make it actually run" branch). All copy lives in a typed `content.ts` module mirroring `app/onboarding/questions.py`.

**Companion plan:** the backend side of this contract (`/me.onboarded`, `submit_onboarding`,
question/answer mapping) is Task 4 of
[2026-07-06-phase0-close-the-learning-loop.md](2026-07-06-phase0-close-the-learning-loop.md).
Build Phase 0 Task 4 before (or together with) this plan's Task 10 gate; until then the wizard
must not mount (fail-open constraint below). This wizard **supersedes** Phase 0's Task 9
(simple `OnboardingDialog`) — do not build both.

**Tech Stack:** React 19 + TypeScript, Vite, vitest + @testing-library/react (jsdom), plain CSS using the existing token system in `frontend/src/index.css`. **No new dependencies.**

## Global Constraints

- All user-facing copy is **German** (Decision #15). Copy strings are exactly those in the spec — do not paraphrase.
- **No new npm dependencies, no new fonts, no new colors.** Use only tokens from `frontend/src/index.css` (`--accent: #818CF8`, `--glass-*`, `--fg-*`, `--radius-*`, etc.).
- Accent color appears **at most once per screen** (the CTA). Secondary buttons use the white-opacity `--control-*` tokens.
- Every animation/transition must be disabled under `@media (prefers-reduced-motion: reduce)`.
- Tests are colocated (`X.test.tsx` next to `X.tsx`) and import `expect, test` etc. explicitly from `vitest` (matching `App.test.tsx`).
- All npm/vitest commands run from `/Users/abdullahabobaker/Desktop/bumssistant/frontend` (`cd` there first).
- If the backend never sends `onboarded`, the wizard must NOT mount — the current backend (`app/main.py:/me`) doesn't send it yet, and the app must keep working against it.
- Commit after every task with a `feat(ui):`/`test(ui):` style message ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

### API contract defined by this plan (backend implements later)

| Endpoint | Request | Response |
|---|---|---|
| `GET /me` | — | existing fields + optional `onboarded: boolean` |
| `GET /onboarding/reflections` | — | `{ "reflections": [{ "id": string, "text": string }] }` |
| `POST /onboarding/answers` | `{ "key": string, "value": string }` | 2xx |
| `POST /onboarding/reflections/{id}` | `{ "action": "confirm" \| "dismiss", "text"?: string }` (edit = confirm with `text`) | 2xx |
| `POST /onboarding/complete` | empty body | 2xx |

Answer keys are the `ColdQuestion.key` values from `app/onboarding/questions.py`: `coaching_style`, `goals`, `stress_triggers`.

---

### Task 1: Content module (German copy + tone previews)

**Files:**
- Create: `frontend/src/components/onboarding/content.ts`
- Test: `frontend/src/components/onboarding/content.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `COACHING_STYLES: readonly ["Direkt & fordernd", "Warm & ermutigend", "Ausgewogen", "Nur die Fakten"]`, `type CoachingStyle`, `TONE_PREVIEWS: Record<CoachingStyle, string>`, `COPY` (nested const object, see code), `firstAssistantMessage(style: CoachingStyle, name: string): string`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/content.test.ts`:

```ts
import { expect, test } from 'vitest'
import { COACHING_STYLES, COPY, TONE_PREVIEWS, firstAssistantMessage } from './content'

test('exposes the four coaching styles from app/onboarding/questions.py, in order', () => {
  expect(COACHING_STYLES).toEqual([
    'Direkt & fordernd',
    'Warm & ermutigend',
    'Ausgewogen',
    'Nur die Fakten',
  ])
})

test('every coaching style has a substantial tone preview', () => {
  for (const style of COACHING_STYLES) {
    expect(TONE_PREVIEWS[style].length).toBeGreaterThan(20)
  }
})

test('welcome copy interpolates the first name', () => {
  expect(COPY.welcome.headline('Anna')).toBe('Hallo, Anna.')
  expect(COPY.handoff.headline('Anna')).toBe('Ich bin bereit, Anna.')
})

test('first assistant message is distinct per style; Nur die Fakten skips small talk', () => {
  const messages = COACHING_STYLES.map(s => firstAssistantMessage(s, 'Anna'))
  expect(new Set(messages).size).toBe(COACHING_STYLES.length)
  expect(firstAssistantMessage('Nur die Fakten', 'Anna')).not.toContain('Anna')
})

test('handoff recap pluralizes correctly', () => {
  expect(COPY.handoff.memoriesConfirmed(1)).toBe('1 Erinnerung bestätigt')
  expect(COPY.handoff.memoriesConfirmed(3)).toBe('3 Erinnerungen bestätigt')
  expect(COPY.handoff.goalsNoted(1)).toBe('1 Ziel notiert')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/content.test.ts`
Expected: FAIL — "Failed to resolve import ./content".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/content.ts`:

```ts
// German onboarding copy — mirrors app/onboarding/questions.py.
// The single source of truth for COLD_QUESTIONS stays in Python; update this
// file whenever COACHING_STYLES or question keys change there.

export const COACHING_STYLES = [
  'Direkt & fordernd',
  'Warm & ermutigend',
  'Ausgewogen',
  'Nur die Fakten',
] as const

export type CoachingStyle = (typeof COACHING_STYLES)[number]

// Same scenario in all four tones (a report due tomorrow) — the user feels
// the difference instead of reading about it.
export const TONE_PREVIEWS: Record<CoachingStyle, string> = {
  'Direkt & fordernd':
    'Der Quartalsbericht ist morgen fällig. Du hast ihn dreimal verschoben. Heute 14 Uhr — 45 Minuten, ich halte dir den Rücken frei.',
  'Warm & ermutigend':
    'Der Quartalsbericht wartet noch auf dich. Wie wäre ein kleiner Anfang heute Nachmittag? Zehn Minuten reichen für den Einstieg.',
  'Ausgewogen':
    'Erinnerung: Quartalsbericht bis morgen. Heute Nachmittag wäre ein guter Zeitpunkt — soll ich dir einen Block freihalten?',
  'Nur die Fakten':
    'Quartalsbericht: fällig morgen, 17:00. Offener Slot heute: 14:00–15:00.',
}

export const COPY = {
  welcome: {
    headline: (name: string) => `Hallo, ${name}.`,
    body:
      'Ich bin BumFlow — dein Arbeitsgedächtnis, dein Fokus-Coach, dein Anti-Aufschieber. ' +
      'In 90 Sekunden bin ich auf dich eingestellt. Danach vergesse ich nie wieder, was dir wichtig ist.',
    cta: "Los geht's",
    trust: 'Alles bleibt bei dir. Nichts wird ohne deine Bestätigung gespeichert.',
  },
  tone: {
    headline: 'Wie soll ich mit dir sprechen?',
    footer: 'Jederzeit änderbar — sag es mir einfach im Chat.',
    cta: 'Weiter',
  },
  reflections: {
    headline: 'Bevor wir starten — stimmt das so?',
    subline: 'Ich schlage nur vor. Du entscheidest, was ich behalte.',
    confirm: 'Stimmt',
    edit: 'Anpassen',
    dismiss: 'Löschen',
    save: 'Speichern',
    editLabel: 'Erinnerung bearbeiten',
    cta: 'Weiter',
  },
  goals: {
    headline: 'Deine Ziele & Stolpersteine',
    goalLabel: 'Was willst du dieses Quartal wirklich schaffen?',
    goalHelp: 'optional — hilft mir, deine Prioritäten zu erkennen',
    stressLabel: 'Und was bringt dich zum Aufschieben?',
    stressHelp: 'optional — damit ich im richtigen Moment helfe statt nerve',
    skip: 'Später im Chat erzählen',
    cta: 'Weiter',
  },
  handoff: {
    headline: (name: string) => `Ich bin bereit, ${name}.`,
    toneLabel: 'Ton',
    memoriesConfirmed: (n: number) => `${n} Erinnerung${n === 1 ? '' : 'en'} bestätigt`,
    goalsNoted: (n: number) => `${n} Ziel${n === 1 ? '' : 'e'} notiert`,
    cta: 'Leg los',
  },
  error: {
    saveFailed: 'Das hat nicht geklappt — nochmal versuchen?',
    retry: 'Nochmal versuchen',
  },
} as const

// BumFlow's very first chat message after the wizard — written in the chosen tone.
export function firstAssistantMessage(style: CoachingStyle, name: string): string {
  switch (style) {
    case 'Direkt & fordernd':
      return `So, ${name} — genug eingerichtet. Was ist das Eine, das du heute weiterbringen willst?`
    case 'Warm & ermutigend':
      return `Schön, dass du da bist, ${name}. Erzähl mir doch: Was beschäftigt dich heute am meisten?`
    case 'Nur die Fakten':
      return 'Einrichtung abgeschlossen. Was steht heute an?'
    case 'Ausgewogen':
      return `Danke, ${name} — ich bin startklar. Womit fangen wir an?`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/content.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/content.ts frontend/src/components/onboarding/content.test.ts
git commit -m "feat(ui): onboarding content module — German copy + tone previews

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API client

**Files:**
- Create: `frontend/src/components/onboarding/api.ts`
- Test: `frontend/src/components/onboarding/api.test.ts`

**Interfaces:**
- Consumes: nothing (uses global `fetch`, same pattern as `ChatWidget.tsx:postChat`).
- Produces:
  - `interface Me { email: string; display_name: string; onboarded?: boolean }`
  - `interface Reflection { id: string; text: string }`
  - `fetchMe(): Promise<Me>`
  - `fetchReflections(): Promise<Reflection[]>`
  - `postAnswer(key: string, value: string): Promise<void>`
  - `resolveReflection(id: string, action: 'confirm' | 'dismiss', text?: string): Promise<void>`
  - `completeOnboarding(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/api.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'
import {
  completeOnboarding, fetchMe, fetchReflections, postAnswer, resolveReflection,
} from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

test('fetchMe returns the /me payload', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    email: 'a@bumg.de', display_name: 'Anna Muster', onboarded: false,
  }))
  vi.stubGlobal('fetch', fetchMock)
  const me = await fetchMe()
  expect(fetchMock).toHaveBeenCalledWith('/me')
  expect(me.display_name).toBe('Anna Muster')
  expect(me.onboarded).toBe(false)
})

test('fetchReflections unwraps the reflections array', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    reflections: [{ id: 'r1', text: 'Du hast montags viele Meetings.' }],
  })))
  expect(await fetchReflections()).toEqual([{ id: 'r1', text: 'Du hast montags viele Meetings.' }])
})

test('postAnswer POSTs key/value as JSON', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
  vi.stubGlobal('fetch', fetchMock)
  await postAnswer('coaching_style', 'Ausgewogen')
  expect(fetchMock).toHaveBeenCalledWith('/onboarding/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'coaching_style', value: 'Ausgewogen' }),
  })
})

test('resolveReflection includes text only when provided', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
  vi.stubGlobal('fetch', fetchMock)
  await resolveReflection('r1', 'confirm')
  expect(fetchMock).toHaveBeenLastCalledWith('/onboarding/reflections/r1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm' }),
  })
  await resolveReflection('r1', 'confirm', 'Korrigierter Text.')
  expect(fetchMock).toHaveBeenLastCalledWith('/onboarding/reflections/r1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', text: 'Korrigierter Text.' }),
  })
})

test('completeOnboarding POSTs with no body', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
  vi.stubGlobal('fetch', fetchMock)
  await completeOnboarding()
  expect(fetchMock).toHaveBeenCalledWith('/onboarding/complete', { method: 'POST' })
})

test('non-2xx surfaces the backend detail message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Kaputt' }, 500)))
  await expect(postAnswer('goals', 'x')).rejects.toThrow('Kaputt')
})

test('non-2xx without JSON body falls back to HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })))
  await expect(completeOnboarding()).rejects.toThrow('HTTP 502')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/api.test.ts`
Expected: FAIL — "Failed to resolve import ./api".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/api.ts`:

```ts
// Onboarding API client. This file DEFINES the backend contract — the backend
// endpoints (except /me) are implemented in the "Make it actually run" branch.
//
//   GET  /me                          → { email, display_name, onboarded?: boolean, ... }
//   GET  /onboarding/reflections      → { reflections: [{ id, text }] }
//   POST /onboarding/answers          ← { key, value }
//   POST /onboarding/reflections/{id} ← { action: 'confirm' | 'dismiss', text? }  (edit = confirm + text)
//   POST /onboarding/complete         ← (empty)

export interface Me {
  email: string
  display_name: string
  onboarded?: boolean
}

export interface Reflection {
  id: string
  text: string
}

async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function fetchMe(): Promise<Me> {
  const res = await ensureOk(await fetch('/me'))
  return await res.json() as Me
}

export async function fetchReflections(): Promise<Reflection[]> {
  const res = await ensureOk(await fetch('/onboarding/reflections'))
  const data = await res.json() as { reflections: Reflection[] }
  return data.reflections
}

export async function postAnswer(key: string, value: string): Promise<void> {
  await ensureOk(await fetch('/onboarding/answers', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ key, value }),
  }))
}

export async function resolveReflection(
  id: string, action: 'confirm' | 'dismiss', text?: string,
): Promise<void> {
  await ensureOk(await fetch(`/onboarding/reflections/${id}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(text === undefined ? { action } : { action, text }),
  }))
}

export async function completeOnboarding(): Promise<void> {
  await ensureOk(await fetch('/onboarding/complete', { method: 'POST' }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/api.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Update the Vite dev proxy** so `/onboarding/*` reaches the backend in dev. In `frontend/vite.config.ts`, add one line to the existing `server.proxy` object:

```ts
  server: {
    proxy: {
      '/chat':       'http://localhost:8000',
      '/me':         'http://localhost:8000',
      '/health':     'http://localhost:8000',
      '/actions':    'http://localhost:8000',
      '/onboarding': 'http://localhost:8000',
    }
  },
```

- [ ] **Step 6: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/api.ts frontend/src/components/onboarding/api.test.ts frontend/vite.config.ts
git commit -m "feat(ui): onboarding API client + contract definition

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: TonePreview component

**Files:**
- Create: `frontend/src/components/onboarding/TonePreview.tsx`
- Create: `frontend/src/components/onboarding/TonePreview.css`
- Test: `frontend/src/components/onboarding/TonePreview.test.tsx`

**Interfaces:**
- Consumes: `TONE_PREVIEWS`, `CoachingStyle` from `./content` (Task 1).
- Produces: `TonePreview({ style }: { style: CoachingStyle })` — a chat-bubble preview with `role="status"`, re-rendering word-by-word when `style` changes.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/TonePreview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TonePreview } from './TonePreview'

test('renders the preview copy for the given style', () => {
  render(<TonePreview style="Nur die Fakten" />)
  expect(screen.getByRole('status')).toHaveTextContent(
    'Quartalsbericht: fällig morgen, 17:00. Offener Slot heute: 14:00–15:00.',
  )
})

test('re-rendering with a new style swaps the copy', () => {
  const { rerender } = render(<TonePreview style="Ausgewogen" />)
  expect(screen.getByRole('status')).toHaveTextContent('soll ich dir einen Block freihalten?')
  rerender(<TonePreview style="Direkt & fordernd" />)
  expect(screen.getByRole('status')).toHaveTextContent('Du hast ihn dreimal verschoben.')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/TonePreview.test.tsx`
Expected: FAIL — "Failed to resolve import ./TonePreview".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/TonePreview.tsx`:

```tsx
import './TonePreview.css'
import type { CoachingStyle } from './content'
import { TONE_PREVIEWS } from './content'

export interface TonePreviewProps {
  style: CoachingStyle
}

// Live preview bubble: the same BumFlow message re-rendered in the selected
// tone. key={style} remounts the <p> so the word-by-word entrance replays.
export function TonePreview({ style }: TonePreviewProps) {
  const text = TONE_PREVIEWS[style]
  return (
    <div className="tone-preview glass-2" role="status" aria-label="Vorschau">
      <div className="tone-preview-avatar" aria-hidden="true">BF</div>
      <p key={style} className="tone-preview-text">
        {text.split(' ').map((word, i) => (
          <span key={i} className="tone-preview-word" style={{ animationDelay: `${i * 30}ms` }}>
            {word}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}
```

Create `frontend/src/components/onboarding/TonePreview.css`:

```css
.tone-preview {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 20px;
  border-radius: var(--radius-md);
  min-height: 96px;
}

/* Reserved space before a style is picked, so the card doesn't jump */
.tone-preview-placeholder {
  min-height: 96px;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
}

.tone-preview-avatar {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--accent);
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.3), rgba(99, 102, 241, 0.2));
  border: 1px solid rgba(129, 140, 248, 0.25);
}

.tone-preview-text {
  font-size: 0.9375rem;
  line-height: 1.6;
}

.tone-preview-word {
  opacity: 0;
  animation: toneWordIn 240ms ease forwards;
}

@keyframes toneWordIn {
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .tone-preview-word { animation: none; opacity: 1; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/TonePreview.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/TonePreview.tsx frontend/src/components/onboarding/TonePreview.css frontend/src/components/onboarding/TonePreview.test.tsx
git commit -m "feat(ui): TonePreview — live coaching-style preview bubble

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: StepWelcome + StepHandoff (the static bookend steps)

**Files:**
- Create: `frontend/src/components/onboarding/StepWelcome.tsx`
- Create: `frontend/src/components/onboarding/StepHandoff.tsx`
- Test: `frontend/src/components/onboarding/StepWelcome.test.tsx`
- Test: `frontend/src/components/onboarding/StepHandoff.test.tsx`

**Interfaces:**
- Consumes: `COPY`, `CoachingStyle` from `./content`.
- Produces:
  - `StepWelcome({ name, onNext }: { name: string; onNext: () => void })`
  - `StepHandoff({ name, style, confirmedCount, goalsCount, onFinish }: { name: string; style: CoachingStyle; confirmedCount: number; goalsCount: number; onFinish: () => void })`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/onboarding/StepWelcome.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepWelcome } from './StepWelcome'

test('greets by first name, shows the trust line, and advances on CTA', () => {
  const onNext = vi.fn()
  render(<StepWelcome name="Anna" onNext={onNext} />)
  expect(screen.getByRole('heading', { name: 'Hallo, Anna.' })).toBeInTheDocument()
  expect(screen.getByText('Alles bleibt bei dir. Nichts wird ohne deine Bestätigung gespeichert.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  expect(onNext).toHaveBeenCalledOnce()
})
```

Create `frontend/src/components/onboarding/StepHandoff.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepHandoff } from './StepHandoff'

test('recaps tone, memories, and goals, and finishes on CTA', () => {
  const onFinish = vi.fn()
  render(
    <StepHandoff name="Anna" style="Direkt & fordernd" confirmedCount={3} goalsCount={1} onFinish={onFinish} />,
  )
  expect(screen.getByRole('heading', { name: 'Ich bin bereit, Anna.' })).toBeInTheDocument()
  expect(screen.getByText('Ton: Direkt & fordernd · 3 Erinnerungen bestätigt · 1 Ziel notiert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Leg los' }))
  expect(onFinish).toHaveBeenCalledOnce()
})

test('omits zero-count recap segments', () => {
  render(
    <StepHandoff name="Anna" style="Ausgewogen" confirmedCount={0} goalsCount={0} onFinish={vi.fn()} />,
  )
  expect(screen.getByText('Ton: Ausgewogen')).toBeInTheDocument()
  expect(screen.queryByText(/bestätigt/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepWelcome.test.tsx src/components/onboarding/StepHandoff.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/components/onboarding/StepWelcome.tsx`:

```tsx
import { COPY } from './content'

export interface StepWelcomeProps {
  name: string
  onNext: () => void
}

export function StepWelcome({ name, onNext }: StepWelcomeProps) {
  return (
    <div className="ob-step" data-step="welcome">
      <h1 className="ob-headline stagger-1">{COPY.welcome.headline(name)}</h1>
      <p className="ob-body stagger-2">{COPY.welcome.body}</p>
      <button className="ob-cta stagger-3" onClick={onNext}>{COPY.welcome.cta}</button>
      <p className="ob-trust stagger-4">{COPY.welcome.trust}</p>
    </div>
  )
}
```

Create `frontend/src/components/onboarding/StepHandoff.tsx`:

```tsx
import { COPY } from './content'
import type { CoachingStyle } from './content'

export interface StepHandoffProps {
  name: string
  style: CoachingStyle
  confirmedCount: number
  goalsCount: number
  onFinish: () => void
}

export function StepHandoff({ name, style, confirmedCount, goalsCount, onFinish }: StepHandoffProps) {
  const parts = [`${COPY.handoff.toneLabel}: ${style}`]
  if (confirmedCount > 0) parts.push(COPY.handoff.memoriesConfirmed(confirmedCount))
  if (goalsCount > 0) parts.push(COPY.handoff.goalsNoted(goalsCount))
  return (
    <div className="ob-step" data-step="handoff">
      <h1 className="ob-headline stagger-1">{COPY.handoff.headline(name)}</h1>
      <p className="ob-recap stagger-2">{parts.join(' · ')}</p>
      <button className="ob-cta stagger-3" onClick={onFinish}>{COPY.handoff.cta}</button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepWelcome.test.tsx src/components/onboarding/StepHandoff.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/StepWelcome.tsx frontend/src/components/onboarding/StepWelcome.test.tsx frontend/src/components/onboarding/StepHandoff.tsx frontend/src/components/onboarding/StepHandoff.test.tsx
git commit -m "feat(ui): onboarding welcome + handoff steps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: StepTone (required coaching-style pick with live preview)

**Files:**
- Create: `frontend/src/components/onboarding/StepTone.tsx`
- Test: `frontend/src/components/onboarding/StepTone.test.tsx`

**Interfaces:**
- Consumes: `COACHING_STYLES`, `COPY`, `CoachingStyle` from `./content`; `TonePreview` from `./TonePreview` (Task 3).
- Produces: `StepTone({ onSubmit }: { onSubmit: (style: CoachingStyle) => void })`. CTA is disabled until a style is selected (this is the one `required=True` question in `app/onboarding/questions.py`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/StepTone.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepTone } from './StepTone'

test('renders all four styles as radios; CTA disabled until one is chosen', () => {
  const onSubmit = vi.fn()
  render(<StepTone onSubmit={onSubmit} />)
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  const cta = screen.getByRole('button', { name: 'Weiter' })
  expect(cta).toBeDisabled()
  fireEvent.click(cta)
  expect(onSubmit).not.toHaveBeenCalled()
})

test('selecting a style shows its live preview and enables submit', () => {
  const onSubmit = vi.fn()
  render(<StepTone onSubmit={onSubmit} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Warm & ermutigend' }))
  expect(screen.getByRole('status')).toHaveTextContent('Der Quartalsbericht wartet noch auf dich.')
  fireEvent.click(screen.getByRole('radio', { name: 'Nur die Fakten' }))
  expect(screen.getByRole('status')).toHaveTextContent('Quartalsbericht: fällig morgen, 17:00.')
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onSubmit).toHaveBeenCalledWith('Nur die Fakten')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepTone.test.tsx`
Expected: FAIL — "Failed to resolve import ./StepTone".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/StepTone.tsx`:

```tsx
import { useState } from 'react'
import { COACHING_STYLES, COPY } from './content'
import type { CoachingStyle } from './content'
import { TonePreview } from './TonePreview'

export interface StepToneProps {
  onSubmit: (style: CoachingStyle) => void
}

export function StepTone({ onSubmit }: StepToneProps) {
  const [selected, setSelected] = useState<CoachingStyle | null>(null)
  return (
    <div className="ob-step" data-step="tone">
      <h1 className="ob-headline stagger-1">{COPY.tone.headline}</h1>
      {selected
        ? <TonePreview style={selected} />
        : <div className="tone-preview-placeholder" aria-hidden="true" />}
      <div className="tone-grid" role="radiogroup" aria-label={COPY.tone.headline}>
        {COACHING_STYLES.map((s, i) => (
          <button
            key={s}
            role="radio"
            aria-checked={selected === s}
            className={`tone-card stagger-${i + 2} ${selected === s ? 'selected' : ''}`}
            onClick={() => setSelected(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="ob-footnote">{COPY.tone.footer}</p>
      <button
        className="ob-cta"
        disabled={!selected}
        onClick={() => selected && onSubmit(selected)}
      >
        {COPY.tone.cta}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepTone.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/StepTone.tsx frontend/src/components/onboarding/StepTone.test.tsx
git commit -m "feat(ui): StepTone — coaching-style picker with live preview

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: StepGoals (the two optional questions)

**Files:**
- Create: `frontend/src/components/onboarding/StepGoals.tsx`
- Test: `frontend/src/components/onboarding/StepGoals.test.tsx`

**Interfaces:**
- Consumes: `COPY` from `./content`.
- Produces: `interface GoalsAnswers { goals: string; stress_triggers: string }` and `StepGoals({ onSubmit }: { onSubmit: (a: GoalsAnswers) => void })`. Skip link submits both fields empty. Field keys match `ColdQuestion.key` in `app/onboarding/questions.py`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/StepGoals.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepGoals } from './StepGoals'

test('submits trimmed answers', () => {
  const onSubmit = vi.fn()
  render(<StepGoals onSubmit={onSubmit} />)
  fireEvent.change(
    screen.getByLabelText('Was willst du dieses Quartal wirklich schaffen?'),
    { target: { value: '  Q3-Angebot fertigstellen ' } },
  )
  fireEvent.change(
    screen.getByLabelText('Und was bringt dich zum Aufschieben?'),
    { target: { value: 'Unklare Anforderungen' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onSubmit).toHaveBeenCalledWith({
    goals: 'Q3-Angebot fertigstellen',
    stress_triggers: 'Unklare Anforderungen',
  })
})

test('skip link submits empty answers', () => {
  const onSubmit = vi.fn()
  render(<StepGoals onSubmit={onSubmit} />)
  fireEvent.click(screen.getByRole('button', { name: 'Später im Chat erzählen' }))
  expect(onSubmit).toHaveBeenCalledWith({ goals: '', stress_triggers: '' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepGoals.test.tsx`
Expected: FAIL — "Failed to resolve import ./StepGoals".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/StepGoals.tsx`:

```tsx
import { useState } from 'react'
import { COPY } from './content'

// Keys match ColdQuestion.key in app/onboarding/questions.py
export interface GoalsAnswers {
  goals: string
  stress_triggers: string
}

export interface StepGoalsProps {
  onSubmit: (answers: GoalsAnswers) => void
}

export function StepGoals({ onSubmit }: StepGoalsProps) {
  const [goals, setGoals] = useState('')
  const [stress, setStress] = useState('')
  return (
    <div className="ob-step" data-step="goals">
      <h1 className="ob-headline stagger-1">{COPY.goals.headline}</h1>
      <label className="ob-label stagger-2">
        {COPY.goals.goalLabel}
        <span className="ob-help">({COPY.goals.goalHelp})</span>
        <textarea
          className="ob-input"
          value={goals}
          onChange={e => setGoals(e.target.value)}
          aria-label={COPY.goals.goalLabel}
        />
      </label>
      <label className="ob-label stagger-3">
        {COPY.goals.stressLabel}
        <span className="ob-help">({COPY.goals.stressHelp})</span>
        <textarea
          className="ob-input"
          value={stress}
          onChange={e => setStress(e.target.value)}
          aria-label={COPY.goals.stressLabel}
        />
      </label>
      <button
        className="ob-skip stagger-4"
        onClick={() => onSubmit({ goals: '', stress_triggers: '' })}
      >
        {COPY.goals.skip}
      </button>
      <button
        className="ob-cta"
        onClick={() => onSubmit({ goals: goals.trim(), stress_triggers: stress.trim() })}
      >
        {COPY.goals.cta}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepGoals.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/StepGoals.tsx frontend/src/components/onboarding/StepGoals.test.tsx
git commit -m "feat(ui): StepGoals — optional goals & stress-trigger questions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: StepReflections (warm-start proposals with Stimmt/Anpassen/Löschen)

**Files:**
- Create: `frontend/src/components/onboarding/StepReflections.tsx`
- Test: `frontend/src/components/onboarding/StepReflections.test.tsx`

**Interfaces:**
- Consumes: `COPY` from `./content`; `Reflection` type from `./api`.
- Produces: `StepReflections({ reflections, onResolve, onDone })` with
  - `reflections: Reflection[]`
  - `onResolve: (id: string, action: 'confirm' | 'dismiss', text?: string) => Promise<void>` — the wizard passes `resolveReflection` from `./api`; the step itself does no fetching (pure UI, testable).
  - `onDone: (confirmedCount: number) => void`
- Behavior: **Stimmt** → `onResolve(id, 'confirm', undefined)`, card gets `confirmed` class (the seal animation) and its action buttons disappear. **Anpassen** → inline textarea, **Speichern** → `onResolve(id, 'confirm', editedText)`. **Löschen** → `onResolve(id, 'dismiss', undefined)`, card gets `dismissed` class. A rejected `onResolve` shows `COPY.error.saveFailed` in a `role="alert"` and leaves the card actionable (spec: never lose state on failed save).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/StepReflections.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepReflections } from './StepReflections'

const TWO = [
  { id: 'r1', text: 'Du hast montags viele Meetings.' },
  { id: 'r2', text: 'Du arbeitest oft an Angeboten.' },
]

test('Stimmt confirms and seals; Anpassen saves edited text; Weiter reports the count', async () => {
  const onResolve = vi.fn().mockResolvedValue(undefined)
  const onDone = vi.fn()
  render(<StepReflections reflections={TWO} onResolve={onResolve} onDone={onDone} />)

  fireEvent.click(screen.getAllByRole('button', { name: 'Stimmt' })[0])
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith('r1', 'confirm', undefined))
  expect(screen.getAllByRole('listitem')[0].className).toContain('confirmed')

  fireEvent.click(screen.getByRole('button', { name: 'Anpassen' }))
  fireEvent.change(screen.getByLabelText('Erinnerung bearbeiten'), {
    target: { value: 'Du arbeitest oft an Ausschreibungen.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
  await waitFor(() =>
    expect(onResolve).toHaveBeenCalledWith('r2', 'confirm', 'Du arbeitest oft an Ausschreibungen.'))

  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onDone).toHaveBeenCalledWith(2)
})

test('Löschen dismisses and does not count as confirmed', async () => {
  const onResolve = vi.fn().mockResolvedValue(undefined)
  const onDone = vi.fn()
  render(<StepReflections reflections={[TWO[0]]} onResolve={onResolve} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith('r1', 'dismiss', undefined))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onDone).toHaveBeenCalledWith(0)
})

test('a failed resolve shows the error and keeps the card actionable', async () => {
  const onResolve = vi.fn().mockRejectedValue(new Error('HTTP 500'))
  render(<StepReflections reflections={[TWO[0]]} onResolve={onResolve} onDone={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stimmt' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt — nochmal versuchen?')
  expect(screen.getByRole('button', { name: 'Stimmt' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepReflections.test.tsx`
Expected: FAIL — "Failed to resolve import ./StepReflections".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/StepReflections.tsx`:

```tsx
import { useState } from 'react'
import { COPY } from './content'
import type { Reflection } from './api'

export interface StepReflectionsProps {
  reflections: Reflection[]
  onResolve: (id: string, action: 'confirm' | 'dismiss', text?: string) => Promise<void>
  onDone: (confirmedCount: number) => void
}

type Resolution = 'confirmed' | 'dismissed'

export function StepReflections({ reflections, onResolve, onDone }: StepReflectionsProps) {
  const [resolved, setResolved] = useState<Record<string, Resolution>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const resolve = async (id: string, action: 'confirm' | 'dismiss', text?: string) => {
    setError(null)
    try {
      await onResolve(id, action, text)
      setResolved(prev => ({ ...prev, [id]: action === 'confirm' ? 'confirmed' : 'dismissed' }))
      setEditing(null)
    } catch {
      setError(COPY.error.saveFailed)
    }
  }

  const confirmedCount = Object.values(resolved).filter(v => v === 'confirmed').length

  return (
    <div className="ob-step" data-step="reflections">
      <h1 className="ob-headline stagger-1">{COPY.reflections.headline}</h1>
      <p className="ob-body stagger-2">{COPY.reflections.subline}</p>
      <ul className="reflection-stack">
        {reflections.map(r => {
          const state = resolved[r.id]
          return (
            <li key={r.id} className={`reflection-card glass-2 ${state ?? ''}`}>
              {editing === r.id ? (
                <>
                  <textarea
                    className="reflection-edit"
                    value={draft}
                    aria-label={COPY.reflections.editLabel}
                    onChange={e => setDraft(e.target.value)}
                  />
                  <div className="reflection-actions">
                    <button className="ob-chip" onClick={() => resolve(r.id, 'confirm', draft)}>
                      {COPY.reflections.save}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="reflection-text">{r.text}</p>
                  {!state && (
                    <div className="reflection-actions">
                      <button className="ob-chip" onClick={() => resolve(r.id, 'confirm', undefined)}>
                        {COPY.reflections.confirm}
                      </button>
                      <button className="ob-chip" onClick={() => { setEditing(r.id); setDraft(r.text) }}>
                        {COPY.reflections.edit}
                      </button>
                      <button className="ob-chip danger" onClick={() => resolve(r.id, 'dismiss', undefined)}>
                        {COPY.reflections.dismiss}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <div className="ob-error" role="alert">{error}</div>}
      <button className="ob-cta" onClick={() => onDone(confirmedCount)}>{COPY.reflections.cta}</button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/StepReflections.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/StepReflections.tsx frontend/src/components/onboarding/StepReflections.test.tsx
git commit -m "feat(ui): StepReflections — confirm/edit/dismiss warm-start proposals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: OnboardingWizard (state machine, progress thread, tint) + wizard CSS

**Files:**
- Create: `frontend/src/components/onboarding/OnboardingWizard.tsx`
- Create: `frontend/src/components/onboarding/OnboardingWizard.css`
- Test: `frontend/src/components/onboarding/OnboardingWizard.test.tsx`

**Interfaces:**
- Consumes: all step components (Tasks 4–7), `content.ts`, and `api.ts` (`fetchReflections`, `postAnswer`, `resolveReflection`, `completeOnboarding`).
- Produces: `OnboardingWizard({ displayName, onComplete }: { displayName: string; onComplete: (welcomeMessage: string) => void })` — Task 10's `App.tsx` mounts this and receives the tone-matched first chat message via `onComplete`.
- Behavior: step order `welcome → tone → [reflections if any] → goals → handoff`. Reflections are fetched once on mount (a fetch error is treated as "no reflections" — never blocks onboarding). Failed `postAnswer` keeps the current step, shows `COPY.error.saveFailed` with a retry button. `finish` calls `completeOnboarding()` (best-effort — a failure does not block the handoff) then `onComplete(firstAssistantMessage(style, firstName))`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/onboarding/OnboardingWizard.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./api', () => ({
  fetchReflections: vi.fn(),
  postAnswer: vi.fn(),
  resolveReflection: vi.fn(),
  completeOnboarding: vi.fn(),
}))

import { completeOnboarding, fetchReflections, postAnswer, resolveReflection } from './api'
import { OnboardingWizard } from './OnboardingWizard'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchReflections).mockResolvedValue([])
  vi.mocked(postAnswer).mockResolvedValue(undefined)
  vi.mocked(resolveReflection).mockResolvedValue(undefined)
  vi.mocked(completeOnboarding).mockResolvedValue(undefined)
})

test('happy path without reflections: welcome → tone → goals → handoff → onComplete', async () => {
  const onComplete = vi.fn()
  render(<OnboardingWizard displayName="Anna Muster" onComplete={onComplete} />)

  expect(screen.getByRole('heading', { name: 'Hallo, Anna.' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))

  fireEvent.click(screen.getByRole('radio', { name: 'Nur die Fakten' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await waitFor(() => expect(postAnswer).toHaveBeenCalledWith('coaching_style', 'Nur die Fakten'))

  // No reflections → step self-skips straight to goals
  expect(await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Später im Chat erzählen' }))

  expect(await screen.findByRole('heading', { name: 'Ich bin bereit, Anna.' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Leg los' }))
  await waitFor(() =>
    expect(onComplete).toHaveBeenCalledWith('Einrichtung abgeschlossen. Was steht heute an?'))
  expect(completeOnboarding).toHaveBeenCalledOnce()
})

test('reflections step appears when proposals exist and confirms via the API', async () => {
  vi.mocked(fetchReflections).mockResolvedValue([
    { id: 'r1', text: 'Du arbeitest oft mit Jira-Tickets.' },
  ])
  render(<OnboardingWizard displayName="Anna Muster" onComplete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  fireEvent.click(screen.getByRole('radio', { name: 'Ausgewogen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

  expect(await screen.findByRole('heading', { name: 'Bevor wir starten — stimmt das so?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stimmt' }))
  await waitFor(() => expect(resolveReflection).toHaveBeenCalledWith('r1', 'confirm', undefined))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })).toBeInTheDocument()
})

test('optional answers are posted only when non-empty', async () => {
  render(<OnboardingWizard displayName="Anna Muster" onComplete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  fireEvent.click(screen.getByRole('radio', { name: 'Ausgewogen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })

  fireEvent.change(
    screen.getByLabelText('Was willst du dieses Quartal wirklich schaffen?'),
    { target: { value: 'Q3-Angebot fertigstellen' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await waitFor(() => expect(postAnswer).toHaveBeenCalledWith('goals', 'Q3-Angebot fertigstellen'))
  expect(postAnswer).not.toHaveBeenCalledWith('stress_triggers', expect.anything())
  // Recap reflects the noted goal
  expect(await screen.findByText('Ton: Ausgewogen · 1 Ziel notiert')).toBeInTheDocument()
})

test('a failed save keeps the step and retry succeeds', async () => {
  vi.mocked(postAnswer).mockRejectedValueOnce(new Error('HTTP 500'))
  render(<OnboardingWizard displayName="Anna Muster" onComplete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  fireEvent.click(screen.getByRole('radio', { name: 'Direkt & fordernd' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

  expect(await screen.findByText('Das hat nicht geklappt — nochmal versuchen?')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Wie soll ich mit dir sprechen?' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }))
  expect(await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL — "Failed to resolve import ./OnboardingWizard".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/onboarding/OnboardingWizard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import './OnboardingWizard.css'
import { COPY, firstAssistantMessage } from './content'
import type { CoachingStyle } from './content'
import { completeOnboarding, fetchReflections, postAnswer, resolveReflection } from './api'
import type { Reflection } from './api'
import { StepWelcome } from './StepWelcome'
import { StepTone } from './StepTone'
import { StepReflections } from './StepReflections'
import { StepGoals } from './StepGoals'
import type { GoalsAnswers } from './StepGoals'
import { StepHandoff } from './StepHandoff'

type StepId = 'welcome' | 'tone' | 'reflections' | 'goals' | 'handoff'

export interface OnboardingWizardProps {
  displayName: string
  onComplete: (welcomeMessage: string) => void
}

export function OnboardingWizard({ displayName, onComplete }: OnboardingWizardProps) {
  const firstName = displayName.split(' ')[0]
  const [step, setStep] = useState<StepId>('welcome')
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [style, setStyle] = useState<CoachingStyle | null>(null)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [goalsCount, setGoalsCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<(() => void) | null>(null)

  useEffect(() => {
    // A failed fetch must never block onboarding — treat it as "nothing noticed".
    fetchReflections().then(setReflections).catch(() => setReflections([]))
  }, [])

  const steps: StepId[] = [
    'welcome',
    'tone',
    ...(reflections.length > 0 ? (['reflections'] as const) : []),
    'goals',
    'handoff',
  ]
  const progress = (steps.indexOf(step) + 1) / steps.length
  const goTo = (s: StepId) => { setError(null); setRetry(null); setStep(s) }
  const after = (cur: StepId): StepId => steps[steps.indexOf(cur) + 1]

  const fail = (retryFn: () => void) => {
    setError(COPY.error.saveFailed)
    setRetry(() => retryFn)
  }

  const submitTone = (s: CoachingStyle) => {
    setError(null)
    postAnswer('coaching_style', s)
      .then(() => { setStyle(s); goTo(after('tone')) })
      .catch(() => fail(() => submitTone(s)))
  }

  const submitGoals = (a: GoalsAnswers) => {
    setError(null)
    const posts: Promise<void>[] = []
    if (a.goals) posts.push(postAnswer('goals', a.goals))
    if (a.stress_triggers) posts.push(postAnswer('stress_triggers', a.stress_triggers))
    Promise.all(posts)
      .then(() => { setGoalsCount(a.goals ? 1 : 0); goTo('handoff') })
      .catch(() => fail(() => submitGoals(a)))
  }

  const finish = () => {
    const chosen = style ?? 'Ausgewogen'
    // Best-effort: a failed completion call must not trap the user in the wizard.
    completeOnboarding()
      .catch(() => {})
      .then(() => onComplete(firstAssistantMessage(chosen, firstName)))
  }

  return (
    <div className="onboarding" data-step={step}>
      <div className="onboarding-tint" aria-hidden="true" />
      <section className="onboarding-card glass-3" aria-label="Einrichtung">
        <div
          className="onboarding-progress"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />
        {step === 'welcome' && <StepWelcome name={firstName} onNext={() => goTo('tone')} />}
        {step === 'tone' && <StepTone onSubmit={submitTone} />}
        {step === 'reflections' && (
          <StepReflections
            reflections={reflections}
            onResolve={resolveReflection}
            onDone={n => { setConfirmedCount(n); goTo('goals') }}
          />
        )}
        {step === 'goals' && <StepGoals onSubmit={submitGoals} />}
        {step === 'handoff' && style && (
          <StepHandoff
            name={firstName}
            style={style}
            confirmedCount={confirmedCount}
            goalsCount={goalsCount}
            onFinish={finish}
          />
        )}
        {error && (
          <div className="ob-error" role="alert">
            {error}
            {retry && (
              <button className="ob-chip" onClick={retry}>{COPY.error.retry}</button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
```

Create `frontend/src/components/onboarding/OnboardingWizard.css`:

```css
/* ═══ Onboarding wizard — one morphing glass-3 card over the ambient backdrop ═══ */

.onboarding {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Backdrop-as-narrator: a per-step tint layered over the ambient backdrop.
   Hue journey: indigo → violet → cyan → green → warm amber at completion. */
.onboarding-tint {
  position: fixed;
  inset: 0;
  pointer-events: none;
  transition: background 800ms ease;
}
.onboarding[data-step='welcome']     .onboarding-tint { background: radial-gradient(ellipse 70% 50% at 50% 30%, rgba(99, 102, 241, 0.18), transparent 65%); }
.onboarding[data-step='tone']        .onboarding-tint { background: radial-gradient(ellipse 70% 50% at 30% 40%, rgba(139, 92, 246, 0.18), transparent 65%); }
.onboarding[data-step='reflections'] .onboarding-tint { background: radial-gradient(ellipse 70% 50% at 70% 40%, rgba(14, 165, 210, 0.16), transparent 65%); }
.onboarding[data-step='goals']       .onboarding-tint { background: radial-gradient(ellipse 70% 50% at 40% 60%, rgba(52, 211, 153, 0.12), transparent 65%); }
.onboarding[data-step='handoff']     .onboarding-tint { background: radial-gradient(ellipse 70% 50% at 50% 40%, rgba(251, 191, 36, 0.14), transparent 65%); }

.onboarding-card {
  position: relative;
  width: min(680px, 100%);
  max-height: 100%;
  overflow-y: auto;
  border-radius: var(--radius-lg);
  padding: 48px;
  box-shadow: var(--shadow-ambient);
}

/* Thread progress: a thin luminous line along the card's top edge */
.onboarding-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), rgba(129, 140, 248, 0.4));
  transform-origin: left;
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* ── Step layout & typography ── */
.ob-step { display: flex; flex-direction: column; gap: 20px; }
.ob-headline { font-size: 2.25rem; font-weight: 300; letter-spacing: -0.025em; line-height: 1.2; }
.ob-body { font-size: 0.9375rem; line-height: 1.6; color: var(--fg-muted); max-width: 48ch; }
.ob-trust, .ob-footnote { font-size: 0.8125rem; color: var(--fg-faint); }
.ob-recap { font-size: 0.9375rem; color: var(--fg-muted); }

/* ── Primary CTA — the ONE accent element per screen ── */
.ob-cta {
  align-self: flex-start;
  padding: 12px 28px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(129, 140, 248, 0.4);
  background: var(--accent-dim);
  color: var(--fg);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}
.ob-cta:hover:not(:disabled) { background: rgba(129, 140, 248, 0.35); transform: translateY(-1px); }
.ob-cta:disabled { opacity: 0.4; cursor: not-allowed; }

.ob-skip {
  background: none;
  border: none;
  color: var(--fg-muted);
  font: inherit;
  font-size: 0.8125rem;
  text-decoration: underline;
  cursor: pointer;
  align-self: flex-start;
}

/* ── Tone cards (Step 1) ── */
.tone-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.tone-card {
  padding: 16px 20px;
  border-radius: var(--radius-md);
  background: var(--control-inactive);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.tone-card:hover { background: var(--control-active); transform: translateY(-2px); }
.tone-card.selected { background: var(--control-active); border-color: rgba(255, 255, 255, 0.35); }

/* ── Reflection cards (Step 2) ── */
.reflection-stack { list-style: none; display: flex; flex-direction: column; gap: 12px; }
.reflection-card {
  padding: 16px 20px;
  border-radius: var(--radius-md);
  transition: opacity 400ms ease;
}
/* The "seal": a brief accent glow when a memory is confirmed, then it files away */
.reflection-card.confirmed { animation: sealGlow 600ms ease; opacity: 0.45; }
.reflection-card.dismissed { opacity: 0.25; text-decoration: line-through; }
@keyframes sealGlow {
  0%   { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0); }
  40%  { box-shadow: 0 0 24px 2px rgba(129, 140, 248, 0.45); }
  100% { box-shadow: 0 0 0 0 rgba(129, 140, 248, 0); }
}
.reflection-text { font-size: 0.9375rem; line-height: 1.6; }
.reflection-actions { display: flex; gap: 8px; margin-top: 12px; }
.reflection-edit {
  width: 100%;
  min-height: 64px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: var(--control-inactive);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  font: inherit;
  resize: vertical;
}

/* ── Secondary chips (white-opacity, never accent) ── */
.ob-chip {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--control-inactive);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background 160ms ease;
}
.ob-chip:hover { background: var(--control-active); }
.ob-chip.danger { color: var(--destructive); }

/* ── Text inputs (Step 3) ── */
.ob-label { display: flex; flex-direction: column; gap: 8px; font-size: 0.9375rem; font-weight: 500; }
.ob-help { font-size: 0.8125rem; font-weight: 400; color: var(--fg-faint); }
.ob-input {
  min-height: 72px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: var(--control-inactive);
  border: 1px solid var(--glass-border);
  color: var(--fg);
  font: inherit;
  resize: vertical;
}
.ob-input:focus { outline: none; border-color: rgba(129, 140, 248, 0.5); }

.ob-error {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--destructive);
  font-size: 0.8125rem;
}

/* ── Staggered entrance (60ms cascade) ── */
.stagger-1, .stagger-2, .stagger-3, .stagger-4, .stagger-5 {
  opacity: 0;
  transform: translateY(8px);
  animation: obFadeUp 400ms ease forwards;
}
.stagger-1 { animation-delay: 0ms; }
.stagger-2 { animation-delay: 60ms; }
.stagger-3 { animation-delay: 120ms; }
.stagger-4 { animation-delay: 180ms; }
.stagger-5 { animation-delay: 240ms; }
@keyframes obFadeUp {
  to { opacity: 1; transform: translateY(0); }
}

/* ── Small screens ── */
@media (max-width: 640px) {
  .onboarding-card { padding: 28px 20px; }
  .tone-grid { grid-template-columns: 1fr; }
  .ob-headline { font-size: 1.75rem; }
}

/* ── Reduced motion: everything static ── */
@media (prefers-reduced-motion: reduce) {
  .onboarding-tint,
  .onboarding-progress,
  .reflection-card,
  .tone-card,
  .ob-cta,
  .ob-chip { transition: none; }
  .reflection-card.confirmed { animation: none; }
  .tone-card:hover, .ob-cta:hover:not(:disabled) { transform: none; }
  .stagger-1, .stagger-2, .stagger-3, .stagger-4, .stagger-5 {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/onboarding/OnboardingWizard.tsx frontend/src/components/onboarding/OnboardingWizard.css frontend/src/components/onboarding/OnboardingWizard.test.tsx
git commit -m "feat(ui): OnboardingWizard — 5-step state machine with progress thread and tint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: ChatWidget/ChatView welcome-message handoff

**Files:**
- Modify: `frontend/src/components/widgets/ChatWidget.tsx` (add optional `initialAssistantMessage` prop)
- Modify: `frontend/src/components/ChatView.tsx` (pass-through `welcomeMessage` prop)
- Test: `frontend/src/components/widgets/ChatWidget.test.tsx` (add one test — keep all existing tests)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `ChatWidget({ initialAssistantMessage }: { initialAssistantMessage?: string })` — when set, shows the typing indicator for 900 ms, then seeds one assistant message with that content. When unset, behavior is exactly as today.
  - `ChatView({ onReviewClick, welcomeMessage }: { onReviewClick: () => void; welcomeMessage?: string })` — forwards `welcomeMessage` to `<ChatWidget initialAssistantMessage={...} />`. Task 10 relies on this prop name.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/widgets/ChatWidget.test.tsx` (do not modify existing tests; add the needed imports if not present — `vi` from `vitest`, `act` from `@testing-library/react`):

```tsx
test('seeds an initial assistant message after a typing beat', async () => {
  vi.useFakeTimers()
  try {
    render(<ChatWidget initialAssistantMessage="Einrichtung abgeschlossen. Was steht heute an?" />)
    // While "typing", the empty state must NOT show — the typing dots do
    expect(document.querySelector('.typing-indicator')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Einrichtung abgeschlossen. Was steht heute an?')).toBeInTheDocument()
    expect(document.querySelector('.typing-indicator')).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/widgets/ChatWidget.test.tsx`
Expected: the new test FAILS (no typing indicator without the prop); existing tests still pass.

- [ ] **Step 3: Implement**

In `frontend/src/components/widgets/ChatWidget.tsx`, change the component signature and add one effect. Replace:

```tsx
export function ChatWidget() {
```

with:

```tsx
export interface ChatWidgetProps {
  /** Set by the onboarding handoff: BumFlow's first message, pre-typed in the chosen tone. */
  initialAssistantMessage?: string
}

export function ChatWidget({ initialAssistantMessage }: ChatWidgetProps = {}) {
```

Then, directly after the existing "Auto-resize textarea" `useEffect`, add:

```tsx
  // Onboarding handoff: BumFlow is "already typing" when the chat first appears.
  useEffect(() => {
    if (!initialAssistantMessage) return
    setLoading(true)
    const t = setTimeout(() => {
      setMessages([{
        id: uid(), role: 'assistant', content: initialAssistantMessage, timestamp: new Date(),
      }])
      setLoading(false)
    }, 900)
    return () => clearTimeout(t)
  }, [initialAssistantMessage])
```

In `frontend/src/components/ChatView.tsx`, replace the props interface and the `ChatWidget` usage:

```tsx
export interface ChatViewProps {
  onReviewClick: () => void
  welcomeMessage?: string
}

export function ChatView({ onReviewClick, welcomeMessage }: ChatViewProps) {
```

and

```tsx
        <ChatWidget initialAssistantMessage={welcomeMessage} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/components/widgets/ChatWidget.test.tsx src/components/ChatView.test.tsx`
Expected: PASS (all tests, including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/components/widgets/ChatWidget.tsx frontend/src/components/widgets/ChatWidget.test.tsx frontend/src/components/ChatView.tsx
git commit -m "feat(ui): chat handoff — seed BumFlow's first message after onboarding

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: App gate — mount the wizard when onboarding is incomplete

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx` (existing tests must be adapted — App now fetches `/me` on mount)

**Interfaces:**
- Consumes: `fetchMe`, `Me` from `./components/onboarding/api`; `OnboardingWizard` from `./components/onboarding/OnboardingWizard`; `ChatView`'s `welcomeMessage` prop (Task 9).
- Produces: gate behavior — wizard mounts **only** when `/me` resolves with `onboarded === false`. Missing field, `true`, or a failed `/me` fetch → normal shell (current backend sends no such field, so nothing changes for it).

- [ ] **Step 1: Update the test file**

Replace the entire contents of `frontend/src/App.test.tsx` with:

```tsx
// frontend/src/App.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./components/onboarding/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/onboarding/api')>()
  return {
    ...actual,
    fetchMe: vi.fn(),
    fetchReflections: vi.fn().mockResolvedValue([]),
  }
})

import { fetchMe } from './components/onboarding/api'
import App from './App'

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue({
    email: 'test@bumg.de', display_name: 'Test User', onboarded: true,
  })
})

test('renders the Chat view by default (composer + sidebar)', async () => {
  render(<App />)
  expect(await screen.findByLabelText('BumFlow')).toBeInTheDocument()      // rail logo
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()           // chat composer
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()                 // sidebar TaskWidget
  expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
})

test('rail nav switches to Memory empty-state and back to Chat', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Memory' }))
  // Query the empty-state <h2> by heading role — the rail also has a "Memory"
  // <span>, so getByText('Memory') would match twice and throw.
  expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()     // composer gone

  fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()           // composer back
})

test('proposed-memories teaser navigates to the Review view', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /Vorschläge/ }))
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument() // empty-state <h2>
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()
})

test('mounts the onboarding wizard when /me says onboarding is incomplete', async () => {
  vi.mocked(fetchMe).mockResolvedValue({
    email: 'anna@bumg.de', display_name: 'Anna Muster', onboarded: false,
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Hallo, Anna.' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()     // no shell yet
})

test('keeps the normal shell when /me is unavailable', async () => {
  vi.mocked(fetchMe).mockRejectedValue(new Error('HTTP 500'))
  render(<App />)
  expect(await screen.findByLabelText('Nachricht')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /Hallo,/ })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify the new gate tests fail**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/App.test.tsx`
Expected: the wizard-gate test FAILS ("Hallo, Anna." never appears); the three pre-existing behavior tests pass.

- [ ] **Step 3: Implement the gate in `App.tsx`**

In `frontend/src/App.tsx`:

Change the first import line from `import { useState } from 'react'` to:

```tsx
import { useEffect, useState } from 'react'
```

Add below the existing imports:

```tsx
import { fetchMe } from './components/onboarding/api'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
```

Inside `App()`, add state + effect above `renderView` and the gate branch above the existing `return`:

```tsx
export default function App() {
  const [view, setView] = useState<View>('chat')
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetchMe()
      .then(m => {
        setDisplayName(m.display_name)
        // Gate ONLY on an explicit false — a backend that doesn't send the
        // field yet (app/main.py today) must never trigger the wizard.
        setNeedsOnboarding(m.onboarded === false)
      })
      .catch(() => { /* backend unavailable → normal shell, same as before */ })
  }, [])

  const renderView = () => {
    switch (view) {
      case 'memory':   return <EmptyState title="Memory" />
      case 'review':   return <EmptyState title="Review" />
      case 'settings': return <EmptyState title="Settings" />
      case 'chat':
      default:         return <ChatView onReviewClick={() => setView('review')} welcomeMessage={welcomeMessage} />
    }
  }

  if (needsOnboarding) {
    return (
      <>
        <AmbientBackdrop />
        <OnboardingWizard
          displayName={displayName}
          onComplete={msg => { setWelcomeMessage(msg); setNeedsOnboarding(false) }}
        />
      </>
    )
  }

  // ... existing return unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run src/App.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(ui): gate app shell behind onboarding wizard on first run

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification (suite, lint, build)

**Files:** none created — verification only.

- [ ] **Step 1: Run the full frontend suite**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npx vitest run`
Expected: ALL tests pass (every pre-existing test plus ~28 new ones). Zero failures, zero unhandled-rejection warnings.

- [ ] **Step 2: Lint**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Type-check + production build**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant/frontend && npm run build`
Expected: `tsc -b` clean, Vite build succeeds.

- [ ] **Step 4: Backend suite is untouched — confirm**

Run: `cd /Users/abdullahabobaker/Desktop/bumssistant && python -m pytest -q`
Expected: all backend tests pass (no backend files were modified by this plan).

- [ ] **Step 5: Commit anything outstanding**

Run `git status` — the tree should already be clean. If a stray formatting change exists, commit it:

```bash
cd /Users/abdullahabobaker/Desktop/bumssistant
git add -A && git commit -m "chore(ui): onboarding wizard finishing touches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
