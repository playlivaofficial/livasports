BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive storage only. Migration does not ingest data or change existing publications.
CREATE TABLE IF NOT EXISTS sports_snapshots (
  snapshot_key text PRIMARY KEY CHECK (length(snapshot_key)<=160),
  competition_id text NOT NULL CHECK (competition_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  season text NOT NULL CHECK (length(season) BETWEEN 1 AND 80),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published)='object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  reviewed_revision integer,
  reviewed_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id,season),
  CHECK (snapshot_key=competition_id||':'||season),
  -- SQL CHECK accepts NULL. IS TRUE is essential: missing/null JSON identities must fail.
  CHECK ((jsonb_typeof(draft->'competitionId')='string' AND jsonb_typeof(draft->'season')='string' AND draft->>'competitionId'=competition_id AND draft->>'season'=season) IS TRUE),
  CHECK (published IS NULL OR ((jsonb_typeof(published->'competitionId')='string' AND jsonb_typeof(published->'season')='string' AND published->>'competitionId'=competition_id AND published->>'season'=season) IS TRUE)),
  CHECK ((reviewed_revision IS NULL)=(reviewed_at IS NULL)),
  CHECK (reviewed_revision IS NULL OR reviewed_revision BETWEEN 1 AND revision)
);
CREATE INDEX IF NOT EXISTS sports_snapshots_published ON sports_snapshots(competition_id,season DESC) WHERE published IS NOT NULL AND NOT archived;
CREATE TABLE IF NOT EXISTS sports_snapshot_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_key text NOT NULL REFERENCES sports_snapshots(snapshot_key),
  action text NOT NULL CHECK (action IN ('create','save','review','publish','archive','refresh','auto-publish')),
  revision integer NOT NULL CHECK (revision>0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sports_snapshot_audit_key ON sports_snapshot_audit(snapshot_key,recorded_at DESC);
CREATE INDEX IF NOT EXISTS sports_snapshot_audit_recent ON sports_snapshot_audit(recorded_at DESC);
CREATE TABLE IF NOT EXISTS sports_source_refresh (
  source_key text PRIMARY KEY,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_allowed_at timestamptz NOT NULL,
  upstream_version text,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 8),
  last_error text,
  lease_token text
);
COMMIT;
