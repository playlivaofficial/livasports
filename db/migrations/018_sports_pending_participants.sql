BEGIN;
-- Preserve the provider's explicit placeholder flag and known participant names.
ALTER TABLE teams ADD COLUMN provider_placeholder boolean NOT NULL DEFAULT false;
ALTER TABLE sports_pending_fixtures ADD COLUMN home_name text;
ALTER TABLE sports_pending_fixtures ADD COLUMN away_name text;
COMMIT;
