# Bumssistant — Project Context for Claude Code

You are the developer of **Bumssistant**: a multi-user, DSGVO-compliant AI work assistant
with persistent per-user memory, self-configuring onboarding, a proactive engine, and
Microsoft/Jira integrations. Coaching persona: **BumFlow** — direct, warm, anti-procrastination.
First customer: the team at **Buben & Mädchen** (German company). UI/output language: German
by default (see Decision #15).

## How to work on this project
- **Read [DECISIONS.md](DECISIONS.md) first** — it is the single source of truth for every
  architectural decision (20 locked, plus open items). Append new decisions there; never rewrite history.
- **[PRIVACY.md](PRIVACY.md)** holds the DSGVO controls and the open legal/Betriebsrat items.
- Keep the reliability bar high: **every core module has pure, DB-free unit tests** in `tests/`.
  Run `python -m pytest -q` before and after changes. Add a test with every new module.
- Nothing imports Langdock directly — always go through `app/llm.py` (`LLMClient`).
- AI-inferred memory is always `status='proposed'` until the user confirms it (Decision #8).

## Architecture (one backend brain, thin clients)
```
Web app (React, TODO) ─┐
Teams bot (TODO) ──────┼─► FastAPI backend ─► Langdock (LLM, EU-hosted)
                       │        │
                       │        ├─► Postgres + pgvector  (hybrid memory)
                       │        └─► n8n (optional, non-critical scheduling only)
```
Backend: Python + FastAPI. Auth: Microsoft Entra ID SSO (dev bypass locally). Memory: hybrid
(typed skeleton + freeform note + embedding, with provenance for auditability).

## What's built & tested
| Layer | File | Tested |
|---|---|---|
| Schema (memory, proactive, retrieval, conversations) | `db/migrations/0001–0004` | via app |
| Memory retrieval (hybrid + score-fusion) | `app/memory/retrieval.py` | ✅ |
| BumFlow persona (1 identity, 4 tone dials) | `app/persona.py` | ✅ |
| Onboarding (short + progressive) | `app/onboarding/questions.py` | ✅ |
| Proactive engine (context-gated, self-suppressing) | `app/proactive/engine.py` | ✅ |
| Working memory (persistent thread + window) | `app/chat/session.py` | ✅ |
| LLM gateway (MockLLM dev / Langdock prod) | `app/llm.py` | ✅ |
| Background seam (in-process → arq later) | `app/background.py` | ✅ |
| Chat orchestrator (the spine) | `app/chat/orchestrator.py` | ✅ end-to-end |
| API skeleton (`/health`, `/me`) | `app/main.py` | — |
| Review + task actions | `app/actions/{memory_review,tasks}.py` | ✅ |
| Onboarding API (wizard contract) | `app/onboarding/http.py` | ✅ |
| Chat history endpoint | `app/chat/repository.py` + `/chat/history` | ✅ |
| Frontend slice 2 (Review) + live sidebar | `frontend/src/` | ✅ |

## Run locally (no corporate account, no real data)
```bash
cp .env.example .env
docker compose up -d          # Postgres + pgvector; migrations auto-apply
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest -q           # 8 tests should pass
uvicorn app.main:app --reload # http://localhost:8000/docs
```
Safety: `DEV_AUTH_BYPASS=true` (refused in prod) + warm-start scan forced to `mock` outside
production. Real employee data never touches a dev laptop.

## NEXT UP (see [docs/ROADMAP.md](docs/ROADMAP.md))
**Phase 0 (close the learning loop) is complete**: memory review actions + panel, task actions +
live sidebar, `/chat/history` (reload-safe thread), and the onboarding backend contract are built
and tested. The onboarding *UI* is the dedicated
[onboarding-wizard plan](docs/superpowers/plans/2026-07-06-onboarding-wizard.md).
Next up is **ROADMAP.md Phase 1 — the proactive scheduler** (APScheduler behind a `Scheduler`
seam: due-rule engine → composers → `role='briefing'` messages), then in-app briefing delivery.
Then Phase 2 (context: Entra auth → Graph calendar → Jira → warm-start) and Phase 3 (team/prod).
