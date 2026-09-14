BEGIN;
-- Official fixtures whose participants are not yet distinct/confirmed.
-- They remain outside normal match/odds records until real participants exist.
CREATE TABLE sports_pending_fixtures (
  id uuid PRIMARY KEY,
  public_id text NOT NULL UNIQUE CHECK(public_id ~ '^[a-f0-9]{16}$'),
  provider_fixture_id bigint NOT NULL UNIQUE,
  season_id uuid NOT NULL REFERENCES seasons(id),
  competition_id uuid NOT NULL REFERENCES competitions(id),
  kickoff timestamptz,
  round_name text,
  stage_name text,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sports_pending_season_idx ON sports_pending_fixtures(season_id,kickoff,id);
ALTER TABLE sports_season_coverage ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
