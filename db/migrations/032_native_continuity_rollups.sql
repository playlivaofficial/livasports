BEGIN;
CREATE TABLE IF NOT EXISTS odds_continuity_rollups (
 bucket timestamptz PRIMARY KEY REFERENCES odds_continuity_samples(bucket) ON DELETE CASCADE,
 metrics jsonb NOT NULL CHECK(jsonb_typeof(metrics)='array')
);
COMMIT;
