BEGIN;

-- P4 product analytics & conversion funnel. First-party, append-only, privacy-first (no raw IP, no e-mail, no tokens).
-- Existing product_events / affiliate_* tables are untouched; the affiliate click ledger remains the commercial source of truth.

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  event_name text NOT NULL,
  event_version smallint NOT NULL DEFAULT 1,
  source text NOT NULL CHECK(source IN ('client','server')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL CHECK(session_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  anonymous_id text NOT NULL CHECK(anonymous_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id uuid,
  traffic_class text NOT NULL CHECK(traffic_class IN ('HUMAN','QA','OWNER','BOT')),
  locale text NOT NULL CHECK(locale IN ('br','mx','en')),
  geo text CHECK(geo IN ('BR','MX')),
  page_type text NOT NULL,
  canonical_path text NOT NULL CHECK(length(canonical_path)<=240),
  referrer_class text NOT NULL,
  utm_source text CHECK(length(utm_source)<=80),
  utm_medium text CHECK(length(utm_medium)<=80),
  utm_campaign text CHECK(length(utm_campaign)<=120),
  utm_content text CHECK(length(utm_content)<=120),
  utm_term text CHECK(length(utm_term)<=120),
  competition_id uuid,
  fixture_id uuid,
  team_id uuid,
  player_id uuid,
  bookmaker text CHECK(bookmaker IN ('betano.bet.br','betsson')),
  market text CHECK(market IN ('MATCH_WINNER','TOTAL_GOALS','BTTS')),
  outcome text CHECK(outcome IN ('HOME','DRAW','AWAY','OVER','UNDER','YES','NO')),
  price_kind text CHECK(price_kind IN ('REAL','PROXY')),
  slip_leg_count smallint CHECK(slip_leg_count BETWEEN 0 AND 10),
  comparison_state text CHECK(comparison_state IN ('REAL_COMPLETE','ESTIMATED_COMPLETE','INCOMPLETE')),
  campaign_id uuid,
  placement text CHECK(length(placement)<=80),
  props jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(pg_column_size(props)<=2048)
);
CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_name_time ON analytics_events(event_name,occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events(session_id,occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_user ON analytics_events(user_id,occurred_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_page ON analytics_events(page_type,occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_competition ON analytics_events(competition_id,occurred_at) WHERE competition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_fixture ON analytics_events(fixture_id,occurred_at) WHERE fixture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_campaign ON analytics_events(campaign_id,occurred_at) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_traffic ON analytics_events(traffic_class,occurred_at);

-- One row per deterministic session (30-minute inactivity window); first-touch attribution is frozen at session start.
CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_id text PRIMARY KEY CHECK(session_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  anonymous_id text NOT NULL CHECK(anonymous_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id uuid,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  traffic_class text NOT NULL CHECK(traffic_class IN ('HUMAN','QA','OWNER','BOT')),
  visitor_kind text NOT NULL CHECK(visitor_kind IN ('NEW','RETURNING')),
  locale text NOT NULL CHECK(locale IN ('br','mx','en')),
  geo text CHECK(geo IN ('BR','MX')),
  landing_path text NOT NULL CHECK(length(landing_path)<=240),
  landing_page_type text NOT NULL,
  referrer_class text NOT NULL,
  referrer_host text CHECK(length(referrer_host)<=120),
  utm_source text CHECK(length(utm_source)<=80),
  utm_medium text CHECK(length(utm_medium)<=80),
  utm_campaign text CHECK(length(utm_campaign)<=120),
  utm_content text CHECK(length(utm_content)<=120),
  utm_term text CHECK(length(utm_term)<=120),
  last_referrer_class text,
  last_utm_campaign text CHECK(length(last_utm_campaign)<=120),
  first_action text,
  event_count integer NOT NULL DEFAULT 0,
  page_views integer NOT NULL DEFAULT 0,
  engaged boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS analytics_sessions_started ON analytics_sessions(started_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_anonymous ON analytics_sessions(anonymous_id,started_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_user ON analytics_sessions(user_id,started_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_sessions_traffic ON analytics_sessions(traffic_class,started_at);

-- Ingestion quality counters per hour (data-quality health for the owner dashboard). Bounded by retention.
CREATE TABLE IF NOT EXISTS analytics_ingestion_quality (
  bucket timestamptz PRIMARY KEY,
  accepted integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  unknown_events integer NOT NULL DEFAULT 0,
  missing_session integer NOT NULL DEFAULT 0,
  oversized integer NOT NULL DEFAULT 0,
  server_events integer NOT NULL DEFAULT 0,
  max_lag_seconds integer NOT NULL DEFAULT 0
);

COMMIT;
