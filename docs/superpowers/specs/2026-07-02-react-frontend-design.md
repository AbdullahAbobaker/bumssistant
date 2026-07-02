# BumFlow Frontend Design Spec

## 0. Design Read (taste-skill)
Reading this as: an internal B2B chat assistant for a German agency (Buben & Mädchen), with a warm but direct persona, leaning toward a sleek, modern chat interface (Vite + React + Vanilla CSS) with glassmorphism touches.

## 1. Dials
- **`DESIGN_VARIANCE: 5`** (Clean, symmetric, functional chat layout)
- **`MOTION_INTENSITY: 5`** (Subtle message transitions, tactile hover feedback, no overwhelming physics)
- **`VISUAL_DENSITY: 5`** (Balanced density: readable chat thread, dense sidebar for context)

## 2. Architecture & Tech Stack
- **Framework:** Vite + React + TypeScript
- **Styling:** Vanilla CSS (no Tailwind per user preference/system prompt, using CSS variables for theming)
- **State:** React Hooks / Context for chat state and history
- **Backend Connection:** Vite proxy to FastAPI `localhost:8000`

## 3. Layout & Components
- **Sidebar (Left, Collapsible):**
  - "Always On" section: Active Projects, Due Tasks
  - Recent Sessions history
- **Main Chat Area:**
  - Full-screen conversational thread
  - Messages bubble up with subtle entry animations
- **Input Area:**
  - Sticky bottom input field
  - Multi-line support (Shift+Enter to newline, Enter to send)

## 4. Aesthetics & Vibe
- **Typography:** Modern Sans-Serif (e.g., Inter or Roboto, standard sizing for high legibility). German language by default.
- **Color Palette:** Neutral slate/zinc bases with a single warm, high-contrast accent color (e.g., deep orange or emerald to match "BumFlow" anti-procrastination warmth). No AI-purple gradients.
- **Glassmorphism:** Subtle translucent sidebars/input backgrounds with backdrop-filter blur, 1px inner border, and soft inner shadow.
- **Tactile Feedback:** Buttons push down slightly on `:active` (`scale: 0.98` equivalent).

## 5. Accessibility & Performance
- **Contrast:** Strict WCAG AA minimum contrast for all text, especially on buttons and inputs.
- **Reduced Motion:** Respect `prefers-reduced-motion` for all transitions.
- **Loading States:** Skeletal loaders for history, typing indicator for BumFlow.
