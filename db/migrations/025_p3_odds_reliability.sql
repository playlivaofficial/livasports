BEGIN;

-- P3 odds reliability & owner control plane. Additive only; every table is small and bounded by retention.

-- One compact health rollup per competition per evaluation (scheduler tick). Baseline for anomaly detection; 14-day retention.
CREATE TABLE IF NOT EXISTS odds_health_rollups (
  id bigserial PRIMARY KEY,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  competition text NOT NULL,
  health text NOT NULL CHECK(health IN ('HEALTHY','DEGRADED','CRITICAL','UPSTREAM_UNAVAILABLE','UNMAPPED','UNKNOWN','IDLE')),
  issue text,
  fixtures_24h integer NOT NULL DEFAULT 0,
  any_24h integer NOT NULL DEFAULT 0,
  fixtures_7d integer NOT NULL DEFAULT 0,
  any_7d integer NOT NULL DEFAULT 0,
  mw_7d integer NOT NULL DEFAULT 0,
  betano_7d integer NOT NULL DEFAULT 0,
  betsson_7d integer NOT NULL DEFAULT 0,
  proxy_7d integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS odds_health_rollups_competition_time ON odds_health_rollups(competition,evaluated_at DESC);
CREATE INDEX IF NOT EXISTS odds_health_rollups_time ON odds_health_rollups(evaluated_at);

-- Deduplicated operational incidents: one open row per competition + classification. Bounded detail, no raw provider payloads.
CREATE TABLE IF NOT EXISTS odds_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition text NOT NULL,
  classification text NOT NULL,
  severity text NOT NULL CHECK(severity IN ('WARNING','CRITICAL')),
  state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  affected_fixtures integer NOT NULL DEFAULT 0,
  recovery_attempts integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution text,
  alert_sent_at timestamptz,
  alert_severity text,
  alert_channel text
);
CREATE UNIQUE INDEX IF NOT EXISTS odds_incidents_open_uq ON odds_incidents(competition,classification) WHERE state<>'RESOLVED';
CREATE INDEX IF NOT EXISTS odds_incidents_opened ON odds_incidents(opened_at DESC);

-- Audit log of every automatic or owner-triggered recovery action; 30-day retention.
CREATE TABLE IF NOT EXISTS odds_recovery_actions (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  trigger_source text NOT NULL CHECK(trigger_source IN ('SCHEDULER','OWNER','INTEGRITY')),
  action text NOT NULL,
  competition text,
  bookmaker text,
  tournament_id text,
  reason text NOT NULL,
  request_cost integer NOT NULL DEFAULT 0,
  outcome text NOT NULL,
  next_retry_at timestamptz,
  budget_remaining_after integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS odds_recovery_actions_time ON odds_recovery_actions(at DESC);

-- Provider catalog rows never disappear because a rule does not understand them; mapping state is explicit.
CREATE TABLE IF NOT EXISTS odds_catalog_rows (
  provider text NOT NULL DEFAULT 'ODDSPAPI' CHECK(provider='ODDSPAPI'),
  tournament_id text NOT NULL CHECK(tournament_id ~ '^[0-9]{1,10}$'),
  tournament_slug text NOT NULL,
  tournament_name text NOT NULL DEFAULT '',
  category_slug text NOT NULL,
  category_name text NOT NULL DEFAULT '',
  sport text NOT NULL DEFAULT 'football',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  mapping_state text NOT NULL CHECK(mapping_state IN ('MAPPED','UNMATCHED','AMBIGUOUS','DISABLED','IGNORED_WITH_REASON')),
  mapped_competition text,
  mapping_reason text NOT NULL DEFAULT '',
  PRIMARY KEY(provider,tournament_id)
);
CREATE INDEX IF NOT EXISTS odds_catalog_rows_state ON odds_catalog_rows(mapping_state);

COMMIT;
