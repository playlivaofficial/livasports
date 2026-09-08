BEGIN;

ALTER TABLE fixtures ADD COLUMN public_id text;
UPDATE fixtures SET public_id = lower(substr(replace(id::text, '-', ''), 1, 16)) WHERE public_id IS NULL;
ALTER TABLE fixtures ALTER COLUMN public_id SET DEFAULT lower(encode(gen_random_bytes(8), 'hex'));
ALTER TABLE fixtures ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE fixtures ADD CONSTRAINT fixtures_public_id_uq UNIQUE (public_id);
ALTER TABLE fixtures ADD CONSTRAINT fixtures_public_id_format CHECK (public_id ~ '^[a-f0-9]{16}$');
ALTER TABLE fixtures ADD COLUMN season_name text;
ALTER TABLE fixtures ADD COLUMN provider_round_id bigint;
ALTER TABLE fixtures ADD COLUMN round_name text;
ALTER TABLE fixtures ADD COLUMN provider_stage_id bigint;
ALTER TABLE fixtures ADD COLUMN stage_name text;
ALTER TABLE fixtures ADD COLUMN provider_group_id bigint;
ALTER TABLE fixtures ADD COLUMN group_name text;
ALTER TABLE fixtures ADD COLUMN venue_name text;
ALTER TABLE fixtures ADD COLUMN venue_city text;

CREATE TABLE fixture_scores (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  provider_score_id bigint NOT NULL,
  participant_id uuid NOT NULL REFERENCES teams(id),
  description text NOT NULL,
  goals integer CHECK (goals IS NULL OR goals >= 0),
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, provider_score_id)
);

CREATE TABLE fixture_events (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  provider_event_id bigint NOT NULL,
  provider_type_id integer,
  event_type text NOT NULL,
  period_id integer,
  detailed_period_id integer,
  minute integer,
  extra_minute integer,
  team_id uuid REFERENCES teams(id),
  player_id bigint,
  player_name text,
  related_player_id bigint,
  related_player_name text,
  result text,
  detail text,
  sort_order integer,
  rescinded boolean NOT NULL DEFAULT false,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, provider_event_id)
);

CREATE TABLE fixture_statistics (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  provider_statistic_id bigint NOT NULL,
  provider_type_id integer,
  statistic_type text NOT NULL,
  team_id uuid REFERENCES teams(id),
  location text CHECK (location IS NULL OR location IN ('home','away')),
  value_numeric numeric,
  value_text text,
  unit text,
  period_scope text NOT NULL DEFAULT 'MATCH',
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, provider_statistic_id)
);

CREATE TABLE fixture_lineups (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  provider_lineup_id bigint NOT NULL,
  team_id uuid NOT NULL REFERENCES teams(id),
  provider_player_id bigint,
  player_name text NOT NULL,
  lineup_type text NOT NULL CHECK (lineup_type IN ('STARTER','SUBSTITUTE','UNKNOWN')),
  position_id integer,
  formation_field text,
  formation_position integer,
  jersey_number integer,
  confirmed boolean NOT NULL DEFAULT true,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, provider_lineup_id)
);

CREATE TABLE fixture_formations (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  formation text NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, team_id)
);

CREATE TABLE fixture_coaches (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  provider_coach_id bigint,
  coach_name text NOT NULL,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, team_id)
);

CREATE TABLE standings_current (
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  stage_id bigint NOT NULL DEFAULT 0,
  group_id bigint NOT NULL DEFAULT 0,
  team_id uuid NOT NULL REFERENCES teams(id),
  provider_standing_id bigint NOT NULL,
  competition_id uuid NOT NULL REFERENCES competitions(id),
  stage_name text,
  group_name text,
  position integer NOT NULL,
  played integer,
  won integer,
  drawn integer,
  lost integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  points integer,
  provider_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, stage_id, group_id, team_id)
);

CREATE TABLE fixture_detail_sync_state (
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('HEADER','SCORES','EVENTS','STATISTICS','LINEUPS','STANDINGS')),
  state text NOT NULL CHECK (state IN ('AVAILABLE','NOT_YET_AVAILABLE','NOT_COVERED','NO_DATA_IN_WINDOW','NOT_APPLICABLE','ERROR','STALE')),
  provider_updated_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  snapshot_at timestamptz,
  request_count integer NOT NULL DEFAULT 0,
  error_message text,
  PRIMARY KEY (fixture_id, module)
);

CREATE TABLE match_center_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  resume_cursor integer NOT NULL DEFAULT 0,
  total_fixtures integer NOT NULL DEFAULT 0,
  processed_fixtures integer NOT NULL DEFAULT 0,
  provider_requests integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text
);

CREATE TABLE product_events (
  event_id uuid PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN ('match_open','match_tab_view','odds_module_view','affiliate_outbound_click','match_share')),
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id),
  locale text NOT NULL CHECK (locale IN ('br','mx')),
  placement text,
  bookmaker text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fixtures_public_match_idx ON fixtures (public_id, kickoff);
CREATE INDEX fixture_events_display_idx ON fixture_events (fixture_id, sort_order, minute, extra_minute);
CREATE INDEX fixture_statistics_display_idx ON fixture_statistics (fixture_id, statistic_type, team_id);
CREATE INDEX fixture_lineups_display_idx ON fixture_lineups (fixture_id, team_id, lineup_type, formation_position);
CREATE INDEX standings_current_display_idx ON standings_current (season_id, stage_id, group_id, position);
CREATE INDEX fixture_detail_sync_freshness_idx ON fixture_detail_sync_state (module, last_success_at DESC);
CREATE INDEX product_events_fixture_time_idx ON product_events (fixture_id, occurred_at DESC);

COMMIT;
