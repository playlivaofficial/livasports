BEGIN;

CREATE TABLE user_favorite_teams (
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

CREATE INDEX user_favorite_teams_team_id_idx ON user_favorite_teams (team_id);

CREATE TABLE user_favorite_competitions (
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competition_id)
);

CREATE INDEX user_favorite_competitions_competition_id_idx ON user_favorite_competitions (competition_id);

CREATE TABLE user_favorite_fixtures (
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fixture_id)
);

CREATE INDEX user_favorite_fixtures_fixture_id_idx ON user_favorite_fixtures (fixture_id);
CREATE INDEX user_favorite_teams_user_created_idx ON user_favorite_teams (user_id, created_at);
CREATE INDEX user_favorite_competitions_user_created_idx ON user_favorite_competitions (user_id, created_at);
CREATE INDEX user_favorite_fixtures_user_created_idx ON user_favorite_fixtures (user_id, created_at);

COMMENT ON TABLE user_favorite_teams IS 'Authenticated user favorite teams. Guest favorites stay in localStorage until merge.';
COMMENT ON TABLE user_favorite_competitions IS 'Authenticated user favorite competitions.';
COMMENT ON TABLE user_favorite_fixtures IS 'Authenticated user favorite fixtures. Separate from guest My Slip.';

COMMIT;
