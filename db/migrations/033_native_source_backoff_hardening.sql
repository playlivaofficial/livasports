BEGIN;

-- Explain target-local failures without changing the existing request or quote records.
ALTER TABLE odds_refresh_targets ADD COLUMN IF NOT EXISTS failure_class text;
ALTER TABLE odds_refresh_targets ADD COLUMN IF NOT EXISTS backoff_reason text;
ALTER TABLE odds_refresh_targets ADD COLUMN IF NOT EXISTS next_recheck_at timestamptz;
ALTER TABLE odds_refresh_targets ADD COLUMN IF NOT EXISTS failure_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS odds_refresh_targets_recheck_idx
  ON odds_refresh_targets(next_recheck_at) WHERE next_recheck_at IS NOT NULL;
UPDATE odds_refresh_targets SET
  failure_class=CASE
    WHEN last_error='ODDSPAPI_HTTP_404' AND last_success_at IS NULL THEN 'HARD_TARGET'
    WHEN last_error='ODDSPAPI_HTTP_404' THEN 'DATA_EMPTY'
    WHEN last_error~'^ODDSPAPI_HTTP_5[0-9][0-9]$' THEN 'TRANSIENT_PROVIDER'
    WHEN last_error='ODDSPAPI_HTTP_429' THEN 'RATE_LIMIT'
    WHEN last_error IN ('ODDSPAPI_HTTP_401','ODDSPAPI_HTTP_403') THEN 'AUTH'
    WHEN last_error LIKE '%NETWORK%' THEN 'TRANSPORT'
    ELSE 'UNKNOWN' END,
  backoff_reason=CASE
    WHEN last_error='ODDSPAPI_HTTP_404' AND last_success_at IS NULL THEN 'HTTP_404_TARGET_NOT_FOUND'
    WHEN last_error='ODDSPAPI_HTTP_404' THEN 'EMPTY_TEMPORARY_RESPONSE'
    WHEN last_error~'^ODDSPAPI_HTTP_5[0-9][0-9]$' THEN 'HTTP_5XX_TRANSIENT'
    WHEN last_error='ODDSPAPI_HTTP_429' THEN 'HTTP_429_RATE_LIMIT'
    WHEN last_error IN ('ODDSPAPI_HTTP_401','ODDSPAPI_HTTP_403') THEN 'AUTH_REJECTED'
    WHEN last_error LIKE '%NETWORK%' THEN 'TRANSPORT_FAILURE'
    ELSE 'INHERITED_HISTORICAL_BACKOFF' END,
  next_recheck_at=retry_after,
  failure_evidence=jsonb_build_object('migrated',true,'lastError',last_error)
WHERE retry_after IS NOT NULL AND (failure_class IS NULL OR backoff_reason IS NULL);

-- Provider identity is deliberately independent from bookmaker identity. The legacy
-- odds_current table remains the primary materialized feed; this table retains every
-- approved supplier independently so a future adapter never overwrites another source.
CREATE TABLE IF NOT EXISTS odds_native_source_current (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_provider text NOT NULL CHECK(length(source_provider) BETWEEN 2 AND 64),
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  market_code text NOT NULL CHECK(market_code IN ('MATCH_WINNER','TOTAL_GOALS','BTTS')),
  outcome_code text NOT NULL CHECK(outcome_code IN ('HOME','DRAW','AWAY','OVER','UNDER','YES','NO')),
  line numeric(8,3),
  decimal_odds numeric NOT NULL CHECK(decimal_odds>1),
  status text NOT NULL CHECK(status IN ('ACTIVE','STALE','SUSPENDED','WITHDRAWN','CLOSED')),
  scope text NOT NULL CHECK(scope='FULL_TIME_REGULATION'),
  phase text NOT NULL CHECK(phase='PREGAME'),
  provider_fixture_id text NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT now(),
  last_successful_refresh_at timestamptz NOT NULL,
  provider_kickoff timestamptz NOT NULL,
  freshness_ttl_minutes numeric NOT NULL CHECK(freshness_ttl_minutes>0),
  source_domain text,
  mapping_verified boolean NOT NULL DEFAULT false,
  confidence text NOT NULL DEFAULT 'VERIFIED' CHECK(confidence IN ('VERIFIED','HIGH','MEDIUM','LOW')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK((market_code='TOTAL_GOALS' AND line IS NOT NULL) OR (market_code<>'TOTAL_GOALS' AND line IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS odds_native_source_current_selection_uq
  ON odds_native_source_current(source_provider,fixture_id,bookmaker_id,market_code,outcome_code,COALESCE(line,-999999.0));
CREATE INDEX IF NOT EXISTS odds_native_source_current_read_idx
  ON odds_native_source_current(fixture_id,bookmaker_id,market_code,observed_at DESC);

CREATE TABLE IF NOT EXISTS odds_native_source_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_provider text NOT NULL,
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  market_code text NOT NULL,
  outcome_code text NOT NULL,
  line numeric(8,3),
  decimal_odds numeric NOT NULL,
  status text NOT NULL,
  provider_fixture_id text NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  confidence text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS odds_native_source_history_audit_idx
  ON odds_native_source_history(fixture_id,bookmaker_id,market_code,outcome_code,observed_at DESC);

-- Retain the current primary source in the new audit store. Public reads continue to use
-- the legacy row for ODDSPAPI, so this idempotent backfill cannot widen eligibility.
INSERT INTO odds_native_source_current(source_provider,fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,scope,phase,
  provider_fixture_id,provider_updated_at,observed_at,persisted_at,last_successful_refresh_at,provider_kickoff,freshness_ttl_minutes,source_domain,mapping_verified,confidence)
SELECT 'ODDSPAPI',fixture_id,bookmaker_id,market_code,outcome_code,line,decimal_odds,status,scope,phase,
  provider_fixture_id,provider_updated_at,observed_at,COALESCE(persisted_at,now()),last_successful_refresh_at,provider_kickoff,freshness_ttl_minutes,source_domain,false,'VERIFIED'
FROM odds_current
WHERE scope='FULL_TIME_REGULATION' AND phase='PREGAME' AND provider_fixture_id IS NOT NULL
  AND observed_at IS NOT NULL AND last_successful_refresh_at IS NOT NULL AND provider_kickoff IS NOT NULL AND freshness_ttl_minutes>0
ON CONFLICT(source_provider,fixture_id,bookmaker_id,market_code,outcome_code,(COALESCE(line,-999999.0))) DO NOTHING;

COMMIT;
