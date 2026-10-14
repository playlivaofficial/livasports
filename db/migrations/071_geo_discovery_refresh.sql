BEGIN;
-- Durable, SEO-only cache refresh receipt. No fixture, odds or user records change.
ALTER TABLE growth_geo_runs ADD COLUMN IF NOT EXISTS discovery_paths jsonb NOT NULL DEFAULT '[]';
ALTER TABLE growth_geo_runs ADD COLUMN IF NOT EXISTS discovery_revalidated_at timestamptz;
CREATE INDEX IF NOT EXISTS growth_geo_runs_pending_discovery ON growth_geo_runs(id)
 WHERE state='SUCCEEDED' AND discovery_revalidated_at IS NULL AND discovery_paths<>'[]'::jsonb;
COMMIT;
