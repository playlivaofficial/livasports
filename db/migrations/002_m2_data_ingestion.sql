BEGIN;

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS team_seasons (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, season_id)
);

CREATE TABLE IF NOT EXISTS ingestion_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_kind text NOT NULL CHECK (sync_kind IN ('FOOTBALL','COMPETITIONS','SEASONS','TEAMS','FIXTURES','SCORES')),
  target_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  records_inserted integer NOT NULL DEFAULT 0 CHECK (records_inserted >= 0),
  records_updated integer NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
  provider_requests integer NOT NULL DEFAULT 0 CHECK (provider_requests >= 0),
  error_message text,
  CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR (status <> 'RUNNING' AND completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS seasons_current_idx ON seasons (competition_id, is_current, starts_at DESC);
CREATE INDEX IF NOT EXISTS team_seasons_season_idx ON team_seasons (season_id, team_id);
CREATE INDEX IF NOT EXISTS fixtures_provider_updated_idx ON fixtures (provider_updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ingestion_sync_runs_health_idx ON ingestion_sync_runs (target_key, sync_kind, started_at DESC);

COMMIT;
