BEGIN;

-- Preserve official historical totals even when the source omits an associated entity.
-- This does not create placeholder teams/players or alter existing commercial tables.
CREATE TABLE sports_unlinked_competition_records (
  season_id uuid NOT NULL REFERENCES seasons(id),
  capability text NOT NULL CHECK (capability IN ('STANDINGS','SCORERS')),
  provider_record_id bigint NOT NULL,
  provider_participant_id bigint,
  provider_player_id bigint,
  team_id uuid REFERENCES teams(id),
  player_id uuid REFERENCES players(id),
  payload jsonb NOT NULL,
  reason text NOT NULL CHECK(reason IN ('TEAM_NOT_EXPANDED','PLAYER_NOT_EXPANDED','TEAM_AND_PLAYER_NOT_EXPANDED')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season_id,capability,provider_record_id)
);

COMMIT;
