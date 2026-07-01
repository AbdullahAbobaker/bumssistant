-- Bumssistant — initial schema
-- Hybrid memory: typed skeleton + freeform note + embedding, with provenance for DSGVO auditability.
-- This file is auto-run by Postgres on first container start (see docker-compose.yml).

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- users: seeded from Microsoft Entra ID SSO (or the dev-auth bypass locally)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_oid     TEXT UNIQUE NOT NULL,          -- Microsoft object id (or 'dev-*' locally)
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  job_title     TEXT,                           -- Phase 0 warm-start (from Entra profile)
  department    TEXT,
  onboarded_at  TIMESTAMPTZ,                    -- null until onboarding completes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- projects: first-class containers; tasks/blockers/decisions link here
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | paused | done | archived
  note        TEXT,
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- memories: the five note-like kinds, unified for shared provenance + recall
-- ---------------------------------------------------------------------------
CREATE TYPE memory_type   AS ENUM ('task','blocker','decision','pattern','comm_style');
CREATE TYPE memory_source AS ENUM ('user_explicit','ai_inferred','integration');
CREATE TYPE memory_status AS ENUM ('proposed','confirmed','rejected','archived');

CREATE TABLE memories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  type           memory_type NOT NULL,
  title          TEXT NOT NULL,                 -- short label
  note           TEXT,                          -- freeform "flesh"
  embedding      VECTOR(1536),                  -- semantic recall
  details        JSONB NOT NULL DEFAULT '{}',   -- type-specific structured fields

  -- promoted hot fields (mainly for tasks) so "what's due today" is a fast index scan
  due_at         TIMESTAMPTZ,
  state          TEXT,                          -- task lifecycle: open|doing|blocked|done

  -- provenance / audit (DSGVO)
  source         memory_source NOT NULL,
  confidence     REAL NOT NULL DEFAULT 1.0,     -- 0..1, low = AI guess
  status         memory_status NOT NULL DEFAULT 'confirmed',
  superseded_by  UUID REFERENCES memories(id),  -- adaptive: evolve without deleting history

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at       TIMESTAMPTZ,
  last_referenced_at TIMESTAMPTZ
);

CREATE INDEX idx_memories_user_type   ON memories (user_id, type);
CREATE INDEX idx_memories_user_status ON memories (user_id, status);
CREATE INDEX idx_memories_due         ON memories (user_id, due_at) WHERE type = 'task';
CREATE INDEX idx_memories_embedding   ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_projects_user        ON projects (user_id);
