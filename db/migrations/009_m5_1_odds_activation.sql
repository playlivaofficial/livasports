BEGIN;

ALTER TABLE odds_sync_jobs DROP CONSTRAINT IF EXISTS odds_sync_jobs_status_check;
ALTER TABLE odds_sync_jobs ADD CONSTRAINT odds_sync_jobs_status_check CHECK(status IN
  ('READY','RUNNING','SUCCEEDED','PARTIAL','FAILED','BUDGET_STOPPED','INTERRUPTED'));
ALTER TABLE odds_sync_jobs ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'MANUAL';
ALTER TABLE odds_sync_jobs ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE odds_provider_requests ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true;
ALTER TABLE odds_provider_requests ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'MANUAL';
ALTER TABLE odds_budget_baselines ADD COLUMN IF NOT EXISTS provider_reported_usage integer;
ALTER TABLE odds_budget_baselines ADD COLUMN IF NOT EXISTS reconciliation_at timestamptz;

CREATE TABLE IF NOT EXISTS odds_refresh_targets (
  bookmaker text NOT NULL CHECK(bookmaker IN ('betano.bet.br','betsson')),
  tournament_id text NOT NULL CHECK(tournament_id IN ('325','27464','17','384')),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  retry_after timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error text,
  PRIMARY KEY(bookmaker,tournament_id)
);
INSERT INTO odds_refresh_targets(bookmaker,tournament_id,last_success_at)
SELECT s.bookmaker,t.id,max(s.observed_at) FROM odds_sync_snapshots s
CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'tournamentIds') t(id)
WHERE s.applied_at IS NOT NULL GROUP BY s.bookmaker,t.id
ON CONFLICT(bookmaker,tournament_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS odds_scheduler_health (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  state text NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','RUNNING','SUCCEEDED','PARTIAL','FAILED','BUDGET_STOPPED')),
  last_job_id uuid REFERENCES odds_sync_jobs(id),
  last_discovery_at timestamptz,
  last_refresh_at timestamptz,
  last_automatic_refresh_at timestamptz,
  last_automatic_invocation_at timestamptz,
  next_due_at timestamptz,
  fixtures_considered integer NOT NULL DEFAULT 0,
  feeds_refreshed jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO odds_scheduler_health(id) VALUES(true) ON CONFLICT DO NOTHING;

ALTER TABLE bookmaker_geo_availability ADD COLUMN IF NOT EXISTS verification_state text NOT NULL DEFAULT 'GENERIC_UNVERIFIED'
  CHECK(verification_state IN ('VERIFIED_BR','VERIFIED_MX','VERIFIED_BR_MX','GENERIC_UNVERIFIED','NOT_ELIGIBLE'));
-- Carry forward only M5's source-proven BR feed; affiliate approval never changes pricing eligibility.
UPDATE bookmaker_geo_availability g SET verification_state=CASE WHEN c.iso2='BR' AND g.odds_enabled AND g.verified_at IS NOT NULL
  THEN 'VERIFIED_BR' ELSE 'NOT_ELIGIBLE' END
FROM bookmakers b,countries c WHERE b.id=g.bookmaker_id AND c.id=g.country_id AND b.provider_slug='betano.bet.br'
  AND g.verification_state='GENERIC_UNVERIFIED';

ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS campaign_verified boolean NOT NULL DEFAULT false;
ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS approved_placement text CHECK(approved_placement='match-odds');

COMMIT;
