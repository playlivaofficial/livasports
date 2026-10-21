BEGIN;
-- Additive and repeatable. Existing newsroom review semantics and prior data are unchanged.
CREATE TABLE IF NOT EXISTS editorial_automation_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT true,
  edited_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO editorial_automation_control(id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS editorial_discovery_state (
  source_id text PRIMARY KEY CHECK (source_id ~ '^[a-z0-9-]{1,80}$'),
  disabled boolean NOT NULL DEFAULT false,
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 8),
  cursor jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(cursor)='object'),
  last_status text NOT NULL DEFAULT 'not-run' CHECK (length(last_status)<=80)
);
CREATE TABLE IF NOT EXISTS editorial_automation_runs (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  lease_until timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','abandoned')),
  requests_reserved integer NOT NULL DEFAULT 0 CHECK (requests_reserved BETWEEN 0 AND 4),
  requests_used integer NOT NULL DEFAULT 0 CHECK (requests_used BETWEEN 0 AND 4),
  model_microusd_reserved integer NOT NULL DEFAULT 0 CHECK (model_microusd_reserved BETWEEN 0 AND 20000),
  model_microusd_used integer NOT NULL DEFAULT 0 CHECK (model_microusd_used>=0),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens>=0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens>=0),
  result jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(result)='object')
);
CREATE INDEX IF NOT EXISTS editorial_automation_runs_day ON editorial_automation_runs(started_at DESC);
-- Actual reported usage must remain observable even if it exceeds the reservation.
-- This replaces only the initial, unreleased 074 acceptance constraint; no rows are altered.
ALTER TABLE editorial_automation_runs DROP CONSTRAINT IF EXISTS editorial_automation_runs_model_microusd_used_check;
ALTER TABLE editorial_automation_runs ADD CONSTRAINT editorial_automation_runs_model_microusd_used_check CHECK (model_microusd_used>=0);
CREATE TABLE IF NOT EXISTS editorial_automation_events (
  event_key text PRIMARY KEY CHECK (length(event_key) BETWEEN 1 AND 240),
  source_id text NOT NULL REFERENCES editorial_discovery_state(source_id),
  source_url text NOT NULL CHECK (length(source_url)<=1000),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts)='object'),
  state text NOT NULL CHECK (state IN ('pending','review','blocked','published','withdrawn','generation-failed')),
  reason text NOT NULL CHECK (length(reason)<=120),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  news_slug text UNIQUE REFERENCES editorial_news(slug),
  publication_revision integer,
  discovered_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  CHECK ((news_slug IS NULL)=(publication_revision IS NULL))
);
CREATE INDEX IF NOT EXISTS editorial_automation_events_queue ON editorial_automation_events(state,changed_at);
CREATE TABLE IF NOT EXISTS editorial_automation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text REFERENCES editorial_automation_events(event_key),
  action text NOT NULL CHECK (length(action)<=80),
  detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail)='object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_automation_audit_time ON editorial_automation_audit(recorded_at DESC);
COMMIT;
