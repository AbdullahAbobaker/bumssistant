-- Working/session memory (DECISIONS.md #17): one persistent thread per user.
-- Messages are logged immediately; a durable rolling_summary keeps context bounded.

CREATE TYPE message_role      AS ENUM ('user', 'assistant', 'briefing');
CREATE TYPE extraction_status AS ENUM ('pending', 'done', 'skipped');

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- one thread/user (v1)
  rolling_summary TEXT NOT NULL DEFAULT '',   -- older turns folded into here
  summary_through TIMESTAMPTZ,                -- messages up to this ts are in rolling_summary
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- denormalized for scoping
  role            message_role NOT NULL,
  content         TEXT NOT NULL,
  -- async write-step tracking: the extraction worker picks up 'pending' user/assistant turns
  extraction      extraction_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conv_time ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_pending   ON messages (created_at) WHERE extraction = 'pending';
