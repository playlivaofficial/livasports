BEGIN;

ALTER TABLE competitions ADD COLUMN IF NOT EXISTS canonical_name text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS display_name_pt_br text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS display_name_es_mx text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS competition_type text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS competition_group text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS coverage_status text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS priority_br integer;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS priority_mx integer;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS season_strategy text;

UPDATE competitions SET
  canonical_name = COALESCE(canonical_name, name),
  display_name_pt_br = COALESCE(display_name_pt_br, name),
  display_name_es_mx = COALESCE(display_name_es_mx, name),
  competition_type = COALESCE(competition_type, 'DOMESTIC_LEAGUE'),
  region = COALESCE(region, CASE WHEN country_id IS NULL THEN 'GLOBAL' ELSE 'SOUTH_AMERICA' END),
  competition_group = COALESCE(competition_group, 'BRAZIL'),
  coverage_status = COALESCE(coverage_status, 'SUPPORTED'),
  priority_br = COALESCE(priority_br, 999),
  priority_mx = COALESCE(priority_mx, 999),
  season_strategy = COALESCE(season_strategy, 'STANDARD'),
  enabled = true
WHERE canonical_name IS NULL OR coverage_status IS NULL;

ALTER TABLE competitions ALTER COLUMN canonical_name SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN display_name_pt_br SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN display_name_es_mx SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN competition_type SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN region SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN competition_group SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN coverage_status SET NOT NULL;
ALTER TABLE competitions ALTER COLUMN season_strategy SET NOT NULL;

ALTER TABLE competitions ADD CONSTRAINT competitions_type_check CHECK (competition_type IN (
  'DOMESTIC_LEAGUE','DOMESTIC_CUP','CONTINENTAL_CLUB','INTERNATIONAL_NATIONAL','QUALIFIER','GLOBAL_CLUB'
));
ALTER TABLE competitions ADD CONSTRAINT competitions_region_check CHECK (region IN (
  'EUROPE','SOUTH_AMERICA','NORTH_AMERICA','MIDDLE_EAST','GLOBAL'
));
ALTER TABLE competitions ADD CONSTRAINT competitions_group_check CHECK (competition_group IN (
  'BRAZIL','EUROPE','AMERICAS','INTERNATIONAL','OTHER'
));
ALTER TABLE competitions ADD CONSTRAINT competitions_coverage_check CHECK (coverage_status IN (
  'SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES','NO_SUBSCRIPTION_ACCESS','NOT_FOUND','AMBIGUOUS_MAPPING'
));
ALTER TABLE competitions ADD CONSTRAINT competitions_season_strategy_check CHECK (season_strategy IN (
  'STANDARD','SPLIT','EDITION','CYCLE'
));

ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_type text NOT NULL DEFAULT 'CLUB';
ALTER TABLE teams ADD CONSTRAINT teams_type_check CHECK (team_type IN ('CLUB','NATIONAL_TEAM'));

ALTER TABLE ingestion_sync_runs ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS competitions_br_priority_idx ON competitions (enabled, priority_br, id) WHERE enabled;
CREATE INDEX IF NOT EXISTS competitions_mx_priority_idx ON competitions (enabled, priority_mx, id) WHERE enabled;
CREATE INDEX IF NOT EXISTS competitions_coverage_idx ON competitions (coverage_status, enabled);
CREATE INDEX IF NOT EXISTS fixtures_competition_status_kickoff_idx ON fixtures (competition_id, status, kickoff);
CREATE INDEX IF NOT EXISTS provider_mappings_provider_lookup_idx
  ON provider_entity_mappings (provider, entity_type, provider_entity_id);

COMMIT;
