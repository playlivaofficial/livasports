BEGIN;

CREATE INDEX IF NOT EXISTS competitions_country_id_idx ON competitions (country_id, id);
CREATE INDEX IF NOT EXISTS fixtures_active_refresh_idx
  ON fixtures (kickoff, status)
  WHERE status IN ('SCHEDULED','LIVE','HALFTIME');
CREATE INDEX IF NOT EXISTS ingestion_sync_runs_latest_success_idx
  ON ingestion_sync_runs (sync_kind, completed_at DESC)
  WHERE status = 'SUCCEEDED';

COMMIT;
