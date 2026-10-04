BEGIN;
-- Add GEO dimensions without rewriting any historical attribution.
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_geo_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_geo_check CHECK(geo IN ('BR','MX','CO','PE','ROW'));
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_locale_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_locale_check CHECK(locale IN ('br','mx','co','pe','en'));
ALTER TABLE analytics_sessions DROP CONSTRAINT IF EXISTS analytics_sessions_geo_check;
ALTER TABLE analytics_sessions ADD CONSTRAINT analytics_sessions_geo_check CHECK(geo IN ('BR','MX','CO','PE','ROW'));
ALTER TABLE analytics_sessions DROP CONSTRAINT IF EXISTS analytics_sessions_locale_check;
ALTER TABLE analytics_sessions ADD CONSTRAINT analytics_sessions_locale_check CHECK(locale IN ('br','mx','co','pe','en'));
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_bookmaker_check;
-- The controlled event boundary resolves the central operator allowlist. Preserve retired brand history.
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_bookmaker_check CHECK(bookmaker IS NULL OR bookmaker ~ '^[a-z0-9][a-z0-9.-]{0,63}$');
CREATE INDEX IF NOT EXISTS analytics_events_geo_competition_human ON analytics_events(geo,occurred_at,competition_id) WHERE traffic_class='HUMAN';
CREATE INDEX IF NOT EXISTS analytics_sessions_geo_human ON analytics_sessions(geo,started_at) WHERE traffic_class='HUMAN';
COMMIT;
