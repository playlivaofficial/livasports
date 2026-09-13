-- Additive: old deployments continue reading/writing while the new scheduler rolls out.
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS freshness_ttl_minutes numeric
  CHECK (freshness_ttl_minutes >= 0 AND freshness_ttl_minutes <= 200000);
