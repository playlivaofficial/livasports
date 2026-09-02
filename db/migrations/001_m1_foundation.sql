BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2 char(2) NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES sports(id),
  country_id uuid REFERENCES countries(id),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, country_id, slug)
);

CREATE TABLE seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions(id),
  name text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, name)
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES sports(id),
  country_id uuid REFERENCES countries(id),
  name text NOT NULL,
  short_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, country_id, name)
);

CREATE TABLE fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES sports(id),
  competition_id uuid NOT NULL REFERENCES competitions(id),
  season_id uuid REFERENCES seasons(id),
  home_team_id uuid NOT NULL REFERENCES teams(id),
  away_team_id uuid NOT NULL REFERENCES teams(id),
  kickoff timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('SCHEDULED','LIVE','HALFTIME','FINISHED','POSTPONED','CANCELLED','ABANDONED')),
  home_score integer CHECK (home_score IS NULL OR home_score >= 0),
  away_score integer CHECK (away_score IS NULL OR away_score >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id),
  UNIQUE (competition_id, home_team_id, away_team_id, kickoff)
);

CREATE TABLE bookmakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  comparison_enabled boolean NOT NULL DEFAULT false,
  affiliate_status text NOT NULL CHECK (affiliate_status IN ('ACTIVE','PENDING','INACTIVE','NOT_APPLIED')),
  affiliate_url text,
  logo_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookmaker_geo_availability (
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  odds_enabled boolean NOT NULL DEFAULT false,
  comparison_enabled boolean NOT NULL DEFAULT false,
  affiliate_enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bookmaker_id, country_id)
);

CREATE TABLE markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code IN ('MATCH_WINNER','TOTAL_GOALS','BTTS')),
  display_name text NOT NULL,
  requires_line boolean NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE odds_current (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  market_code text NOT NULL CHECK (market_code IN ('MATCH_WINNER','TOTAL_GOALS','BTTS')),
  outcome_code text NOT NULL CHECK (outcome_code IN ('HOME','DRAW','AWAY','OVER','UNDER','YES','NO')),
  line numeric(8,3),
  decimal_odds numeric(10,4) NOT NULL CHECK (decimal_odds > 1),
  provider_updated_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE','STALE','SUSPENDED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((market_code = 'TOTAL_GOALS' AND line IS NOT NULL) OR (market_code <> 'TOTAL_GOALS' AND line IS NULL))
);

CREATE UNIQUE INDEX odds_current_selection_uq
  ON odds_current (fixture_id, bookmaker_id, market_code, outcome_code, COALESCE(line, -999999.0));

CREATE TABLE odds_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  market_code text NOT NULL,
  outcome_code text NOT NULL,
  line numeric(8,3),
  decimal_odds numeric(10,4) NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('SPORTMONKS','ODDSPAPI')),
  entity_type text NOT NULL CHECK (entity_type IN ('SPORT','COUNTRY','COMPETITION','SEASON','TEAM','FIXTURE','BOOKMAKER','MARKET')),
  provider_entity_id text NOT NULL,
  livasports_entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, entity_type, provider_entity_id),
  UNIQUE (provider, entity_type, livasports_entity_id)
);

CREATE TABLE affiliate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  country_id uuid NOT NULL REFERENCES countries(id),
  destination_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bookmaker_id, country_id)
);

CREATE TABLE affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id uuid NOT NULL REFERENCES affiliate_links(id),
  fixture_id uuid REFERENCES fixtures(id),
  clicked_at timestamptz NOT NULL DEFAULT now(),
  referrer text,
  user_agent text,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX fixtures_kickoff_idx ON fixtures (kickoff);
CREATE INDEX fixtures_competition_kickoff_idx ON fixtures (competition_id, kickoff);
CREATE INDEX fixtures_status_kickoff_idx ON fixtures (status, kickoff);
CREATE INDEX odds_current_fixture_status_idx ON odds_current (fixture_id, status, provider_updated_at DESC);
CREATE INDEX odds_history_lookup_idx ON odds_history (fixture_id, bookmaker_id, market_code, outcome_code, provider_updated_at DESC);
CREATE INDEX provider_mappings_livasports_idx ON provider_entity_mappings (livasports_entity_id);
CREATE INDEX affiliate_clicks_link_time_idx ON affiliate_clicks (affiliate_link_id, clicked_at DESC);

INSERT INTO countries (id, iso2, name) VALUES
  ('54b8670e-469c-4f2c-9151-43f178954c6f', 'BR', 'Brazil'),
  ('7e173f82-4ed6-4cdc-a8b9-9af95f692e02', 'MX', 'Mexico');

INSERT INTO sports (id, code, name) VALUES
  ('4b6ca767-90b1-4275-ad70-fc25c40f8352', 'FOOTBALL', 'Football');

INSERT INTO bookmakers (id, provider_slug, display_name, comparison_enabled, affiliate_status) VALUES
  ('12d40eac-847b-4058-8358-82eb2bcae2ed', 'betano.bet.br', 'Betano BR', true, 'NOT_APPLIED'),
  ('7387b37f-ccc2-4e0e-aa95-56a8a993e232', 'betsson', 'Betsson', true, 'ACTIVE');

INSERT INTO markets (id, code, display_name, requires_line) VALUES
  ('e39a2115-d3f6-44ac-96ba-aad4b2ad36ae', 'MATCH_WINNER', 'Match Winner', false),
  ('0b720fb0-1802-4b99-94f1-bd445186f32e', 'TOTAL_GOALS', 'Total Goals', true),
  ('914d3c89-c5d1-4f1f-a80c-328e3f13aadf', 'BTTS', 'Both Teams To Score', false);

COMMIT;
