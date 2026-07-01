-- Proactive engine config.
-- Same philosophy as memory: the system PROPOSES, the human CONFIRMS.
-- A rule only fires when status='confirmed'. AI-suggested rules start 'proposed'.

CREATE TYPE touchpoint_type AS ENUM (
  'morning_briefing', 'midday_checkin', 'end_of_day_recap', 'custom'
);
CREATE TYPE rule_status AS ENUM ('proposed', 'confirmed', 'disabled');
CREATE TYPE rule_source AS ENUM ('user_selected', 'ai_suggested');

CREATE TABLE proactive_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  touchpoint        touchpoint_type NOT NULL,
  send_time         TIME NOT NULL,                          -- local wall-clock send time
  timezone          TEXT NOT NULL DEFAULT 'Europe/Berlin',
  weekdays          SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- ISO: 1=Mon .. 7=Sun
  status            rule_status NOT NULL DEFAULT 'proposed',
  source            rule_source NOT NULL,
  suggestion_reason TEXT,                                    -- why the AI proposed it (null if user_selected)
  last_fired_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proactive_user   ON proactive_rules (user_id);
CREATE INDEX idx_proactive_active ON proactive_rules (status, send_time) WHERE status = 'confirmed';
