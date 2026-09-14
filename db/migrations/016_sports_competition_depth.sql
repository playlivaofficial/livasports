BEGIN;

-- Sports-only coverage evidence and season totals. No commercial schema changes.
CREATE TABLE sports_season_coverage (
  season_id uuid NOT NULL REFERENCES seasons(id),
  capability text NOT NULL CHECK (capability IN ('FIXTURES','STANDINGS','SCORERS','TEAMS','SQUADS','PLAYER_STATISTICS')),
  status text NOT NULL CHECK (status IN ('AVAILABLE','EMPTY','UNAVAILABLE','ERROR','INCOMPLETE')),
  provider_count integer NOT NULL DEFAULT 0 CHECK (provider_count>=0),
  persisted_count integer NOT NULL DEFAULT 0 CHECK (persisted_count>=0),
  http_status integer,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id,capability)
);
CREATE TABLE season_topscorers (
  season_id uuid NOT NULL REFERENCES seasons(id),
  provider_record_id bigint NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  provider_type_id integer NOT NULL,
  position integer NOT NULL,
  total numeric NOT NULL CHECK(total>=0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season_id,provider_record_id)
);
CREATE INDEX season_topscorers_display_idx ON season_topscorers(season_id,provider_type_id,position);
ALTER TABLE standings_current ADD COLUMN provider_rule jsonb;
ALTER TABLE standings_current ADD COLUMN provider_form jsonb;
ALTER TABLE standings_current ADD COLUMN provider_details jsonb;
CREATE INDEX fixtures_season_history_idx ON fixtures(season_id,status,kickoff DESC,id);

COMMIT;
