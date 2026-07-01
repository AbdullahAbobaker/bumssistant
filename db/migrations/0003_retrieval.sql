-- Retrieval upgrades (DECISIONS.md #16): keyword search, importance, validity window.
-- Enables hybrid vector + full-text retrieval with weighted score-fusion.

ALTER TABLE memories
  ADD COLUMN importance  REAL NOT NULL DEFAULT 0.5,   -- 0..1: how core this fact is
  ADD COLUMN valid_until TIMESTAMPTZ;                 -- optional expiry (null = no expiry)

-- Keyword search via Postgres full-text (German stemming).
-- Real BM25 (pg_search/ParadeDB) is a drop-in v2 swap; ts_rank is enough for v1.
ALTER TABLE memories
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('german', coalesce(title, '') || ' ' || coalesce(note, ''))
  ) STORED;

CREATE INDEX idx_memories_search ON memories USING gin (search_tsv);
