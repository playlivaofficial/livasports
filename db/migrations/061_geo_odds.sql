BEGIN;
-- Separate country feeds for the same operator must never overwrite one another.
-- Legacy BR quotes and their history are retained unchanged.
CREATE TABLE IF NOT EXISTS odds_geo_current (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geo text NOT NULL CHECK (geo IN ('MX','CO','PE')),
  source_provider text NOT NULL,
  provider_bookmaker_id text NOT NULL,
  fixture_id uuid NOT NULL REFERENCES fixtures(id),
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  market_code text NOT NULL CHECK (market_code IN ('MATCH_WINNER','TOTAL_GOALS','BTTS')),
  outcome_code text NOT NULL,
  line numeric,
  decimal_odds numeric NOT NULL CHECK (decimal_odds>1 AND decimal_odds<=1000),
  status text NOT NULL CHECK (status IN ('ACTIVE','STALE','SUSPENDED','WITHDRAWN','CLOSED')),
  scope text NOT NULL CHECK (scope='FULL_TIME_REGULATION'),
  phase text NOT NULL CHECK (phase='PREGAME'),
  provider_fixture_id text NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT now(),
  last_successful_refresh_at timestamptz NOT NULL,
  provider_kickoff timestamptz NOT NULL,
  freshness_ttl_minutes numeric NOT NULL CHECK(freshness_ttl_minutes>=0),
  source_domain text,
  mapping_verified boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS odds_geo_current_identity ON odds_geo_current
  (geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code,(COALESCE(line,-999999.0)));
CREATE INDEX IF NOT EXISTS odds_geo_current_fixture ON odds_geo_current(geo,fixture_id);
CREATE TABLE IF NOT EXISTS odds_geo_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id uuid NOT NULL,
  geo text NOT NULL CHECK(geo IN ('MX','CO','PE')),
  source_provider text NOT NULL,
  provider_bookmaker_id text NOT NULL,
  fixture_id uuid NOT NULL REFERENCES fixtures(id),
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  market_code text NOT NULL,
  outcome_code text NOT NULL,
  line numeric,
  decimal_odds numeric NOT NULL,
  status text NOT NULL,
  observed_at timestamptz NOT NULL,
  source_domain text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS odds_geo_history_fixture ON odds_geo_history(geo,fixture_id,observed_at DESC);
COMMIT;
