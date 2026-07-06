# Onboarding Wizard — "Der erste Eindruck" (Design)

**Date:** 2026-07-06
**Status:** Approved by user (brainstorming session)
**Scope:** In-app first-run onboarding for the React frontend — a cinematic fullscreen wizard
that a new Buben & Mädchen employee sees on first login, ending in a live ChatView handoff.

Builds on:
- `app/onboarding/questions.py` — warm-start reflections + 3 cold questions (Decision #13)
- Decision #8 — AI-inferred memory is `proposed` until user-confirmed
- Decision #15 — UI language is German
- `frontend/src/index.css` — ambient-glassmorphism token system (no new fonts, no new colors)

---

## 1. Flow — 5 steps, ~90 seconds

Fullscreen stepped experience rendered over the existing `ambient-backdrop`, replacing the
app shell until complete. One `glass-3` stage card; exactly one accent CTA per screen.

### Step 0 — Ankunft (welcome)
Personalized greeting; display name comes from Entra ID SSO (`/me`).

> **Hallo, {Vorname}.**
> Ich bin BumFlow — dein Arbeitsgedächtnis, dein Fokus-Coach, dein Anti-Aufschieber.
> In 90 Sekunden bin ich auf dich eingestellt. Danach vergesse ich nie wieder, was dir wichtig ist.
>
> CTA: **Los geht's**
> Trust line (small, below CTA): *Alles bleibt bei dir. Nichts wird ohne deine Bestätigung gespeichert.*

The trust line is required copy, not decoration — DSGVO reassurance for a German
works-council audience.

### Step 1 — Dein Ton (coaching style — the one required question)
Four style cards from `COACHING_STYLES`. Above them, a **live preview bubble**: the same
BumFlow message re-renders in the selected tone on click. Preview copy (scenario: a task
due tomorrow):

- **Direkt & fordernd:** „Der Quartalsbericht ist morgen fällig. Du hast ihn dreimal
  verschoben. Heute 14 Uhr — 45 Minuten, ich halte dir den Rücken frei."
- **Warm & ermutigend:** „Der Quartalsbericht wartet noch auf dich. Wie wäre ein kleiner
  Anfang heute Nachmittag? Zehn Minuten reichen für den Einstieg."
- **Ausgewogen:** „Erinnerung: Quartalsbericht bis morgen. Heute Nachmittag wäre ein guter
  Zeitpunkt — soll ich dir einen Block freihalten?"
- **Nur die Fakten:** „Quartalsbericht: fällig morgen, 17:00. Offener Slot heute: 14:00–15:00."

Headline: **Wie soll ich mit dir sprechen?**
Footer: *Jederzeit änderbar — sag es mir einfach im Chat.*
CTA **Weiter** is disabled until a style is selected (required per `questions.py`).

### Step 2 — Das habe ich bemerkt (warm-start reflections)
Proposed memories as stacked cards, each with **Stimmt** / **Anpassen** / **Löschen**.
- **Stimmt** flips the memory `proposed → confirmed` (Decision #8) with a brief accent-glow
  "seal" animation before the card files away.
- **Anpassen** opens inline edit; saving confirms the edited text.
- **Löschen** discards the proposal.

Headline: **Bevor wir starten — stimmt das so?**
Subline: *Ich schlage nur vor. Du entscheidest, was ich behalte.*

If the backend returns zero proposed memories (dev/mock mode, or no warm-start data),
this step self-skips — the wizard goes straight from Step 1 to Step 3.

### Step 3 — Deine Ziele & Stolpersteine (the two optional questions)
Both free-text questions on one screen; explicitly skippable (`required=False`).

> **Was willst du dieses Quartal wirklich schaffen?**
> *(optional — hilft mir, deine Prioritäten zu erkennen)*
>
> **Und was bringt dich zum Aufschieben?**
> *(optional — damit ich im richtigen Moment helfe statt nerve)*

Skip link: *Später im Chat erzählen* · CTA: **Weiter**
Answers map to memories via the existing `target` fields (`pattern:goal`,
`pattern:stress_trigger`).

### Step 4 — Übergabe (handoff)
Recap of what BumFlow now knows, then transition into chat.

> **Ich bin bereit, {Vorname}.**
> Ton: {gewählter Stil} · {n} Erinnerungen bestätigt · {m} Ziel(e) notiert
> CTA: **Leg los**

On CTA: the wizard card dissolves, `ChatView` rises up, and BumFlow's first message is
already typing — written in the chosen tone. The product starts working before the user
touches anything.

---

## 2. Design elements (premium feel, within the existing system)

1. **Backdrop as narrator** — the existing `ambientDrift` gradients shift hue per step
   (indigo → warm amber at completion) via a CSS variable set by the wizard.
   `prefers-reduced-motion` disables all wizard motion, matching existing CSS behavior.
2. **One card, morphing** — a single `glass-3` stage that resizes/re-lays-out with a spring
   transition between steps. An object, not a slideshow.
3. **Live tone preview** (Step 1) — the interactive centerpiece; preview text crossfades
   word-by-word between tones.
4. **Staggered entrance** — headline first (existing 300-weight `text-heading-large`),
   options fade-up 60 ms apart.
5. **Thread progress** — a thin luminous line along the card's top edge that fills per
   step. No "Schritt 2 von 5" counter.
6. **Seal micro-interaction** — confirming a memory stamps it with an accent glow; makes
   user sovereignty over memory *felt*.
7. **Typography & color discipline** — no new fonts (DSGVO note in `index.css` stands),
   no new colors; accent `#818CF8` appears exactly once per screen, on the CTA.

---

## 3. Architecture

- **Gate:** `App.tsx` fetches `/me`; if the response says onboarding is incomplete
  (backend uses `is_complete()` from `app/onboarding/questions.py`), it mounts
  `OnboardingWizard` instead of the app shell.
- **Components:** `frontend/src/components/onboarding/`
  - `OnboardingWizard.tsx` — step state machine, progress thread, backdrop hue variable
  - `StepWelcome.tsx`, `StepTone.tsx`, `StepReflections.tsx`, `StepGoals.tsx`, `StepHandoff.tsx`
  - `TonePreview.tsx` — the live preview bubble (pure, testable: style in → copy out)
- **Persistence:** answers are `POST`ed per step (endpoint shape to be finalized in the
  implementation plan, e.g. `POST /onboarding/answers`), so progress survives a reload.
  Completion writes memories via the existing `target` mapping; reflections use the
  existing proposed→confirmed memory endpoints.
- **Data flow:** wizard reads cold questions and preview copy from a typed frontend
  constant mirroring `COLD_QUESTIONS` (single source of truth stays in Python; the
  frontend copy of options is validated by a test against the API response).
- **Error handling:** failed step-POSTs keep the user on the step with a retry affordance
  (German error copy: „Das hat nicht geklappt — nochmal versuchen?"); the wizard never
  loses typed input on a failed save.
- **Testing:** one `*.test.tsx` per component, matching the existing pattern — step
  gating (required tone), self-skip of Step 2 when no proposals, seal state transition,
  and the `is_complete` gate in `App.tsx`.

## 4. Out of scope

- Backend endpoint implementation (belongs to the "Make it actually run" branch work;
  the implementation plan will define the exact contract).
- Warm-start scan itself (already decided: forced to `mock` outside production).
- Teams-bot onboarding variant.
