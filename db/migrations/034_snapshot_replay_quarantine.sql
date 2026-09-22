BEGIN;

-- A saved provider response whose replay keeps failing must never block the scheduler tick.
-- Replays are bounded; a quarantined snapshot stays as evidence and is surfaced as an incident.
ALTER TABLE odds_sync_snapshots ADD COLUMN IF NOT EXISTS replay_failures integer NOT NULL DEFAULT 0;
ALTER TABLE odds_sync_snapshots ADD COLUMN IF NOT EXISTS replay_error text;
ALTER TABLE odds_sync_snapshots ADD COLUMN IF NOT EXISTS quarantined_at timestamptz;
CREATE INDEX IF NOT EXISTS odds_sync_snapshots_pending ON odds_sync_snapshots(observed_at) WHERE applied_at IS NULL AND quarantined_at IS NULL;

COMMIT;
