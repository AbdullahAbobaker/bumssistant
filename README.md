# Bumssistant

A multi-user, DSGVO-compliant AI work assistant with persistent per-user memory,
self-configuring onboarding, a proactive engine, and Microsoft/Jira integrations.
Coaching persona: **BumFlow** — direct, warm, anti-procrastination.

See [DECISIONS.md](DECISIONS.md) for architecture and [PRIVACY.md](PRIVACY.md) for DSGVO.

## Stack
- **Backend:** Python + FastAPI
- **Memory:** Postgres + pgvector (hybrid: typed skeleton + freeform note + embedding)
- **LLM gateway:** Langdock (EU-hosted, DSGVO-compliant)
- **Frontend:** React + TypeScript *(not scaffolded yet)*
- **Auth:** Microsoft Entra ID SSO

## Run it on your laptop (no corporate account needed)

Prereqs: **Docker** and **Python 3.11+**.

```bash
# 1. Config
cp .env.example .env          # defaults already work for local dev

# 2. Database (Postgres + pgvector; schema auto-applies on first start)
docker compose up -d

# 3. Backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open **http://localhost:8000/docs**.
- `GET /health` → `{"status":"ok","db":true}` confirms the DB is wired.
- `GET /me` → returns the dev-bypass user and confirms scan mode is `mock` locally.

### Safety on a private laptop
`DEV_AUTH_BYPASS=true` logs you in as a fake user (refused in production).
The warm-start scan is **forced to `mock`** outside production — no real company or
personal data is ever pulled onto your machine.

## Layout
```
db/migrations/   SQL migrations (auto-run by Postgres on first start)
app/
  config.py      settings (env-driven, single source of truth)
  db.py          async DB engine + session
  auth.py        Entra SSO + fail-closed dev bypass
  main.py        FastAPI app (/health, /me)
```
