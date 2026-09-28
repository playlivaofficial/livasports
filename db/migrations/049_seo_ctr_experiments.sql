BEGIN;

ALTER TABLE seo_gsc_syncs ADD COLUMN IF NOT EXISTS from_day date;
ALTER TABLE seo_gsc_syncs ADD COLUMN IF NOT EXISTS to_day date;

-- Owner-only measurements. No changes to sports, odds, users or indexability.
CREATE TABLE IF NOT EXISTS seo_page_breakdowns (
  property text NOT NULL,
  day date NOT NULL,
  page text NOT NULL,
  dimension text NOT NULL CHECK(dimension IN ('QUERY','COUNTRY','DEVICE')),
  key text NOT NULL,
  clicks integer NOT NULL CHECK(clicks>=0),
  impressions integer NOT NULL CHECK(impressions>=0),
  ctr double precision NOT NULL,
  position double precision NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(property,day,page,dimension,key)
);
CREATE INDEX IF NOT EXISTS seo_page_breakdowns_page_day ON seo_page_breakdowns(property,page,day);
CREATE TABLE IF NOT EXISTS seo_breakdown_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL,
  dimension text NOT NULL CHECK(dimension IN ('QUERY','COUNTRY','DEVICE')),
  from_day date NOT NULL,
  to_day date NOT NULL,
  state text NOT NULL CHECK(state IN ('SUCCEEDED','FAILED','TRUNCATED')),
  row_count integer NOT NULL DEFAULT 0,
  error_code text,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_breakdown_syncs_recent ON seo_breakdown_syncs(property,captured_at DESC);

-- Registration is explicit and immutable; daily recommendation jobs cannot rewrite metadata.
CREATE TABLE IF NOT EXISTS seo_metadata_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key text NOT NULL,
  property text NOT NULL,
  page text NOT NULL,
  locale text NOT NULL CHECK(locale IN ('br','mx','en')),
  query_cluster text NOT NULL,
  reason text NOT NULL,
  old_title text NOT NULL,
  old_description text NOT NULL,
  new_title text NOT NULL,
  new_description text NOT NULL,
  baseline jsonb NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz,
  release_sha text,
  -- First full Search Console (Pacific) day AFTER deployment. Never include a partial release day.
  observation_start date,
  UNIQUE(experiment_key,page),
  CHECK((changed_at IS NULL AND observation_start IS NULL AND release_sha IS NULL)
    OR (changed_at IS NOT NULL AND observation_start IS NOT NULL AND release_sha ~ '^[a-f0-9]{40}$'))
);
CREATE INDEX IF NOT EXISTS seo_metadata_experiments_changed ON seo_metadata_experiments(changed_at DESC);
CREATE TABLE IF NOT EXISTS seo_experiment_observations (
  experiment_id uuid NOT NULL REFERENCES seo_metadata_experiments(id),
  window_days integer NOT NULL CHECK(window_days IN (7,14,28)),
  from_day date NOT NULL,
  to_day date NOT NULL,
  metrics jsonb NOT NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(experiment_id,window_days)
);
COMMIT;
