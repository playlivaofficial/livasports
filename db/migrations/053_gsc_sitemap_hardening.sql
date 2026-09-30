BEGIN;
-- Additive per-root state only; preserve all prior successful hashes/timestamps and history.
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS checked_at timestamptz;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS diagnostic jsonb;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS audit jsonb NOT NULL DEFAULT '[]';
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS attempted_hash text;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS submitted_property text;
ALTER TABLE seo_autopilot_sitemaps ADD COLUMN IF NOT EXISTS blocked_context text;
COMMIT;
