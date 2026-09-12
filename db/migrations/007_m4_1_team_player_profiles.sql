BEGIN;

ALTER TABLE teams ADD COLUMN public_id text;
UPDATE teams SET public_id = lower(substr(replace(id::text, '-', ''), 1, 16)) WHERE public_id IS NULL;
ALTER TABLE teams ALTER COLUMN public_id SET DEFAULT lower(encode(gen_random_bytes(8), 'hex'));
ALTER TABLE teams ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE teams ADD CONSTRAINT teams_public_id_uq UNIQUE (public_id);
ALTER TABLE teams ADD CONSTRAINT teams_public_id_format CHECK (public_id ~ '^[a-f0-9]{16}$');
ALTER TABLE teams ADD COLUMN founded_year integer CHECK (founded_year IS NULL OR founded_year BETWEEN 1800 AND 2100);
ALTER TABLE teams ADD COLUMN venue_name text;
ALTER TABLE teams ADD COLUMN venue_city text;
ALTER TABLE teams ADD COLUMN coach_name text;
ALTER TABLE teams ADD COLUMN profile_state text NOT NULL DEFAULT 'NOT_YET_INGESTED'
  CHECK (profile_state IN ('AVAILABLE','PARTIAL','NOT_YET_INGESTED','NOT_COVERED','ERROR','STALE'));
ALTER TABLE teams ADD COLUMN profile_updated_at timestamptz;

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT lower(encode(gen_random_bytes(8), 'hex')),
  sport_id uuid NOT NULL REFERENCES sports(id),
  common_name text,
  firstname text,
  lastname text,
  name text NOT NULL,
  display_name text NOT NULL,
  image_url text,
  country_name text,
  nationality_name text,
  position_id integer,
  position_name text,
  detailed_position_id integer,
  detailed_position_name text,
  date_of_birth date,
  height_cm integer CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  weight_kg integer CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 250),
  gender text,
  profile_state text NOT NULL DEFAULT 'PARTIAL'
    CHECK (profile_state IN ('AVAILABLE','PARTIAL','NOT_YET_INGESTED','NOT_COVERED','ERROR','STALE')),
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT players_public_id_uq UNIQUE (public_id),
  CONSTRAINT players_public_id_format CHECK (public_id ~ '^[a-f0-9]{16}$')
);

CREATE TABLE player_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('SPORTMONKS','ODDSPAPI')),
  provider_player_id text NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_player_id),
  UNIQUE (provider, player_id)
);

CREATE TABLE profile_statistic_types (
  provider text NOT NULL CHECK (provider IN ('SPORTMONKS','ODDSPAPI')),
  provider_type_id integer NOT NULL,
  name text NOT NULL,
  developer_name text,
  model_type text,
  stat_group text,
  value_shape jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_type_id)
);

CREATE TABLE team_squad_memberships (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  provider_squad_id bigint,
  position_id integer,
  position_name text,
  detailed_position_id integer,
  detailed_position_name text,
  jersey_number integer CHECK (jersey_number IS NULL OR jersey_number BETWEEN 0 AND 999),
  starts_at date,
  ends_at date,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, season_id, player_id),
  UNIQUE (team_id, season_id, provider_squad_id)
);

CREATE TABLE team_season_statistics (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  provider_statistic_id bigint NOT NULL,
  provider_type_id integer NOT NULL,
  value jsonb NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, season_id, provider_type_id)
);

CREATE TABLE player_season_statistics (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  provider_statistic_id bigint NOT NULL,
  provider_type_id integer NOT NULL,
  value jsonb NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, team_id, season_id, provider_type_id)
);

CREATE TABLE fixture_player_statistics (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  provider_statistic_id bigint NOT NULL,
  provider_type_id integer NOT NULL,
  value jsonb NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, player_id, provider_type_id)
);

ALTER TABLE fixture_lineups ADD COLUMN player_entity_id uuid REFERENCES players(id);
ALTER TABLE fixture_events ADD COLUMN player_entity_id uuid REFERENCES players(id);
ALTER TABLE fixture_events ADD COLUMN related_player_entity_id uuid REFERENCES players(id);

CREATE TABLE profile_sync_state (
  entity_type text NOT NULL CHECK (entity_type IN ('TEAM','PLAYER')),
  entity_id uuid NOT NULL,
  module text NOT NULL CHECK (module IN ('IDENTITY','METADATA','COMPETITIONS','MATCHES','STANDINGS','SQUAD','STATISTICS','MATCH_LOG')),
  state text NOT NULL CHECK (state IN ('AVAILABLE','PARTIAL','NOT_YET_INGESTED','NOT_COVERED','NOT_APPLICABLE','ERROR','STALE')),
  provider_updated_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  snapshot_at timestamptz,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  error_message text,
  PRIMARY KEY (entity_type, entity_id, module)
);

CREATE TABLE profile_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  target_key text NOT NULL,
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  resume_cursor integer NOT NULL DEFAULT 0,
  total_targets integer NOT NULL DEFAULT 0,
  processed_targets integer NOT NULL DEFAULT 0,
  provider_requests integer NOT NULL DEFAULT 0,
  records_inserted integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text
);

CREATE TABLE profile_sponsor_campaigns (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  locale text NOT NULL CHECK (locale IN ('br','mx')),
  placement text NOT NULL CHECK (placement IN ('team_top_leaderboard','team_right_rail','team_inline','player_top_leaderboard','player_right_rail','player_inline','profile_mobile_inline')),
  label text NOT NULL,
  image_url text NOT NULL,
  image_alt text NOT NULL,
  destination_url text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locale, placement, id)
);

CREATE TABLE profile_sponsor_events (
  event_id uuid PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN ('sponsor_impression','sponsor_outbound_click')),
  campaign_id text NOT NULL REFERENCES profile_sponsor_campaigns(id),
  placement text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('br','mx')),
  entity_type text NOT NULL CHECK (entity_type IN ('TEAM','PLAYER')),
  entity_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX teams_public_profile_idx ON teams (public_id, updated_at DESC);
CREATE INDEX players_public_profile_idx ON players (public_id, updated_at DESC);
CREATE INDEX player_provider_lookup_idx ON player_provider_mappings (provider, provider_player_id);
CREATE INDEX squad_team_season_idx ON team_squad_memberships (team_id, season_id, position_id, jersey_number);
CREATE INDEX squad_player_idx ON team_squad_memberships (player_id, season_id);
CREATE INDEX team_statistics_context_idx ON team_season_statistics (team_id, competition_id, season_id);
CREATE INDEX player_statistics_context_idx ON player_season_statistics (player_id, competition_id, season_id, team_id);
CREATE INDEX fixture_player_statistics_display_idx ON fixture_player_statistics (fixture_id, player_id, provider_type_id);
CREATE INDEX profile_sync_freshness_idx ON profile_sync_state (entity_type, module, last_success_at DESC);
CREATE UNIQUE INDEX profile_sync_single_active_idx ON profile_sync_jobs ((status)) WHERE status='RUNNING';
CREATE INDEX profile_sponsor_eligibility_idx ON profile_sponsor_campaigns (locale, placement, enabled, starts_at, ends_at);
CREATE INDEX profile_sponsor_events_time_idx ON profile_sponsor_events (campaign_id, occurred_at DESC);

COMMIT;
