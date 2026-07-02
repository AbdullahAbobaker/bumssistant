# Bumssistant UI Plan — Immersive Ambient Glassmorphism

**Date:** 2026-07-02
**Status:** Plan (design intent) — not yet a build spec. Frontend framework still an open decision (#).
**Source:** ui-ux-pro-max "Liquid Glass" design system + the brief's "Immersive Ambient Glassmorphism".
**Stack reality:** Bumssistant frontend is **React + TypeScript (web)** (Decisions #2 "web app first", #4), not
React Native. Tokens/CSS below are web (CSS variables + `backdrop-filter`).

## 1. The vibe

Premium, minimal, contextual, cinematic. Interface elements are **frosted-glass panels floating over an
ambient backdrop**, universally soft (no hard right angles), monochrome-white iconography, and controls whose
state is read from **opacity / white-fill**, not bright brand color. BumFlow (the coach) should feel like a
calm, ambient presence — the UI recedes; the conversation and the person's context lead.

## 2. THE constraint that decides success: legibility over the backdrop

Liquid Glass rates **⚠ contrast** and **⚠ moderate-poor performance**. Glass over a photo is where most
glassmorphism looks amateur and fails WCAG. Non-negotiables (Accessibility is Priority #1):

- **Every glass surface carries a contrast floor.** A panel = translucent white fill **+ a scrim** so text on
  it always clears **4.5:1** regardless of what photo is behind. Practically: `background: rgba(15,23,42,0.55)`
  (dark scrim) *under* the frosted white layer, or a bottom-up gradient scrim on full-bleed regions.
- **Text is white at high opacity on the scrimmed glass**, never white text directly on an unknown photo.
- **Test contrast against the worst-case (brightest) backdrop frame**, not the average.
- **`backdrop-filter: blur()` is a fallback-gated enhancement**, never the sole source of legibility — if blur
  is unsupported/disabled, the scrim alone must still pass. (Also: cap blur layers — perf.)
- The backdrop is **decoration**; it must never compete with content (blur + darken + reduce saturation behind
  active panels).

## 3. The ambient backdrop (proposed adaptation)

"Photographic backgrounds" for a work coach shouldn't be literal stock photos. Proposed: **time-aware ambient
scenes** — soft, cinematic gradient-mesh / abstract landscapes that shift with the user's day (dawn → day →
dusk → night), reinforcing BumFlow's *contextual* coaching. Cinematic without being noisy.
- **Bundled local assets** (no external CDN fetch) — consistent with the DSGVO/no-leak ethos (PRIVACY.md).
- Very low motion (slow parallax/drift only), fully gated by `prefers-reduced-motion`.
- *Open decision:* time-aware ambient scenes vs a single calm gradient vs user-selectable — see §11.

## 4. Design tokens

Dark, cinematic base (from the design system), reworked **monochrome-first** per the brief (state via opacity,
not brand color). Accent used **only** for the single primary action per screen — and even that is optional.

```css
:root {
  /* Ambient base (behind glass) */
  --bg-base: #0F172A;              /* deep navy, cinematic */
  --scrim: rgba(15, 23, 42, 0.55); /* legibility floor under glass */

  /* Glass surfaces (translucent white, layered by elevation) */
  --glass-1: rgba(255,255,255,0.06);  /* base panel */
  --glass-2: rgba(255,255,255,0.10);  /* raised (cards, active) */
  --glass-3: rgba(255,255,255,0.16);  /* overlay/modal/sheet */
  --glass-border: rgba(255,255,255,0.14);
  --glass-blur: 16px;                 /* backdrop-filter: blur(16px) saturate(120%) */

  /* Text (on scrimmed glass — verified ≥4.5:1) */
  --fg: rgba(255,255,255,0.96);
  --fg-muted: rgba(255,255,255,0.72);  /* ≥4.5:1 on scrim; not below */
  --fg-faint: rgba(255,255,255,0.50);  /* decorative/large only */

  /* Controls — state by opacity/white-fill (the brief) */
  --control-inactive: rgba(255,255,255,0.10);
  --control-active:   rgba(255,255,255,0.28);  /* higher-opacity white fill = "on" */
  --control-knob: rgba(255,255,255,0.96);

  /* Accent — RESERVED. One primary CTA per screen, or omit entirely for pure monochrome. */
  --accent: #6366F1;               /* indigo, softened from #4338CA */
  --destructive: #F87171;          /* reject/delete, still glass-toned */

  /* Soft shapes — no right angles */
  --radius-sm: 12px; --radius-md: 20px; --radius-lg: 28px; --radius-pill: 999px;
  --shadow-ambient: 0 8px 40px rgba(0,0,0,0.35);
}
```

Typography: **Inter** (300–700), `line-height: 1.5`, base 16px. Tabular figures for any counts/dates.

## 5. Glass component system

- **Three surface tiers** (`--glass-1/2/3`) = a consistent elevation scale; blur + `--glass-border` (1px
  hairline) + `--shadow-ambient`. Never invent ad-hoc opacity values.
- **Soft geometry everywhere:** `--radius-md` default; pills for controls; no 0-radius corners.
- **Elevation via opacity + blur + hairline border**, not heavy drop shadows.
- Panels darken/blur the region behind them so foreground always wins (blur-as-dismissal, per HIG).

## 6. Controls (the brief's opacity-driven states)

| Control | Inactive | Active/On |
|---|---|---|
| Toggle | `--control-inactive` track, knob at 0.7 | `--control-active` track (subtle white gradient), knob `--control-knob` |
| Slider | faint track, low-opacity fill | higher-opacity white fill grows with value |
| Segmented / nav item | text `--fg-muted`, no fill | `--glass-2` fill + text `--fg`, hairline highlight |
| Button (secondary) | `--glass-1` | `--glass-2` on hover/press |
| Button (single primary) | `--control-active` white pill **or** `--accent` (pick one, once per screen) | brighter fill |

State is legible **without color** (opacity + fill + a check/indicator) — satisfies `color-not-only`.

## 7. Icons

- **White monochrome**, single family (**Lucide** — outline, or solid for active), consistent stroke (1.5–2px).
- Active = higher opacity / solid variant; inactive = `--fg-muted` outline. Never emoji. SVG only.
- Icon-only buttons get `aria-label`; ≥44×44 hit area.

## 8. Motion

- Fluid **400–600ms** morph/blur transitions (Liquid Glass signature) — but **1–2 elements per view max**,
  `transform`/`opacity` only, ease-out enter / faster exit.
- Panels animate from their trigger (spatial continuity). Backdrop drift is slow and subtle.
- **`prefers-reduced-motion`: drop morphing + parallax to simple fades.** Content readable immediately.

## 9. Screens (mapped to Bumssistant's real surfaces)

**App shell:** ambient backdrop layer → a single glass **left rail** (desktop) / bottom bar (mobile, ≤5 items):
Chat · Memory · Review · Settings. Active item = `--glass-2` fill + white indicator.

1. **BumFlow chat (hero surface).** Full-height conversation over the backdrop. Assistant turns on `--glass-2`
   bubbles; user turns lighter/right-aligned. Bottom **glass composer** pill (multiline, send). When BumFlow
   calls a tool/creates a proposal, show a subtle inline glass chip ("Vorschlag erstellt →"). One primary
   action (send). This is where 90% of time is spent — keep it calm and legible.
2. **Review panel (proposed → confirmed, Decisions #8/#17).** The batched confirm queue for AI-inferred
   memories. Stack of glass cards; each shows title/note/type + provenance (`ai_inferred`, confidence) and two
   controls: **Confirm** (white-fill primary) / **Reject** (`--destructive`, spatially separated per
   `destructive-emphasis`). Swipe or button; undo toast. Empty state: "Nichts zu bestätigen."
3. **Memory viewer (Decision #2).** Browsable confirmed memory: filter by type (task/pattern/…), search,
   status chips. Read-first, glass list rows; tap → detail sheet (`--glass-3`). Shows provenance for
   auditability (DSGVO transparency).
4. **Onboarding (short + progressive, #13).** A few full-screen ambient steps: the mandatory **coaching-style**
   choice (4 tone options as glass cards, selected = `--control-active` fill), then optional goals/stress. Big
   type, one choice per screen, lots of whitespace — matches the "Minimal Single Column" pattern.

## 10. Accessibility & quality gates (must pass before "done")

- Text ≥ **4.5:1** on every glass surface, verified against the brightest backdrop frame (scrim guarantees it).
- Visible focus rings (2–4px, white/high-contrast) on all interactive elements.
- `prefers-reduced-motion` honored; no info by color alone; dynamic type / zoom to 200% without breakage.
- Perf: cap simultaneous `backdrop-filter` layers; `will-change` sparingly; lazy backdrop; test on a mid
  laptop (glass is GPU-heavy). Provide a "reduce transparency" fallback (solid `--bg-base` + `--glass` as flat
  tints) for low-power / unsupported browsers.
- Responsive: 375 / 768 / 1024 / 1440; left rail → bottom bar at mobile.

## 11. Resolved decisions (2026-07-02)

1. **Frontend framework — DECIDED: Vite + React + TypeScript + Tailwind** (SPA over the FastAPI backend;
   design tokens as CSS variables). Resolves the roadmap's open frontend-framework item.
2. **Backdrop — DECIDED: time-aware ambient scenes by default, user-selectable override.** Ships with the
   dawn→day→dusk→night ambient set as the automatic default; a Settings control lets the user pick a fixed
   scene / calm gradient / "reduce transparency" flat mode. All bundled locally (no CDN leak).
3. **Accent — DECIDED: pure monochrome-first.** State is opacity/white-fill only; `--accent` stays defined but
   **unused by default**, reserved for at most one restrained primary action on a screen that genuinely needs
   stronger emphasis. Truest to the brief.
4. **First build slice — chat surface + app shell + the glass token system**, then review panel → memory
   viewer → onboarding. **Not started yet — planning only (build deferred by request).**

## 12. Not in this plan

Component-level build spec/code, the framework scaffold, and real backend wiring — those come after the
framework decision (§11.1). This is the design language + screen map to build against.
