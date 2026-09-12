BEGIN;

-- Preserve every existing record. Legacy/unverified quotes remain outside M5 reads.
ALTER TABLE odds_current ALTER COLUMN decimal_odds TYPE numeric;
ALTER TABLE odds_history ALTER COLUMN decimal_odds TYPE numeric;
ALTER TABLE odds_current ALTER COLUMN provider_updated_at DROP NOT NULL;
ALTER TABLE odds_history ALTER COLUMN provider_updated_at DROP NOT NULL;
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS scope text CHECK(scope='FULL_TIME_REGULATION');
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS phase text CHECK(phase='PREGAME');
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS provider_fixture_id text;
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS source_domain text;
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS observed_at timestamptz;
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS persisted_at timestamptz;
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS last_successful_refresh_at timestamptz;
ALTER TABLE odds_current ADD COLUMN IF NOT EXISTS provider_kickoff timestamptz;
ALTER TABLE odds_history ADD COLUMN IF NOT EXISTS scope text CHECK(scope='FULL_TIME_REGULATION');
ALTER TABLE odds_history ADD COLUMN IF NOT EXISTS phase text CHECK(phase='PREGAME');
ALTER TABLE odds_history ADD COLUMN IF NOT EXISTS observed_at timestamptz;

CREATE TABLE IF NOT EXISTS odds_mapping_reviews (
  provider text NOT NULL DEFAULT 'ODDSPAPI' CHECK(provider='ODDSPAPI'),
  provider_fixture_id text PRIMARY KEY,
  fixture_id uuid REFERENCES fixtures(id),
  state text NOT NULL CHECK(state IN ('EXACT','HIGH_CONFIDENCE','AMBIGUOUS','NO_MATCH','TIME_MISMATCH','TEAM_MISMATCH','COMPETITION_MISMATCH')),
  reason text NOT NULL,
  evidence jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS odds_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED','INTERRUPTED')),
  lease_expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  cursor integer NOT NULL DEFAULT 0,
  provider_requests integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);
CREATE UNIQUE INDEX IF NOT EXISTS odds_sync_one_running ON odds_sync_jobs((status)) WHERE status='RUNNING';
CREATE TABLE IF NOT EXISTS odds_provider_requests (
  id text PRIMARY KEY,
  job_id uuid REFERENCES odds_sync_jobs(id),
  endpoint text NOT NULL,
  safe_query jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  http_status integer,
  outcome text NOT NULL DEFAULT 'RESERVED'
);
CREATE INDEX IF NOT EXISTS odds_provider_requests_time ON odds_provider_requests(started_at);
CREATE TABLE IF NOT EXISTS odds_budget_baselines (
  period_start timestamptz PRIMARY KEY,
  period_end timestamptz NOT NULL,
  externally_consumed integer NOT NULL CHECK(externally_consumed>=0),
  hard_limit integer NOT NULL CHECK(hard_limit BETWEEN 1 AND 5000),
  verified_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS odds_sync_snapshots (
  id text PRIMARY KEY,
  bookmaker text NOT NULL,
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  applied_at timestamptz
);
CREATE TABLE IF NOT EXISTS odds_provider_catalog (
  provider text PRIMARY KEY CHECK(provider='ODDSPAPI'),
  markets jsonb NOT NULL,
  tournaments jsonb NOT NULL,
  verified_at timestamptz NOT NULL
);
ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE product_events ADD COLUMN IF NOT EXISTS market text CHECK(market IN ('MATCH_WINNER','TOTAL_GOALS','BTTS'));
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK(event_name IN
  ('match_open','match_tab_view','odds_module_view','odds_market_view','odds_bookmaker_click','odds_unavailable_view','affiliate_outbound_click','match_share'));

COMMIT;
