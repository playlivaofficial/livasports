BEGIN;
-- Additive shadow state: the current production build may keep using the old
-- fixture-only BR table during Preview/deploy. No legacy row/key/view is changed.
CREATE TABLE IF NOT EXISTS growth_geo_priorities (
  geo text NOT NULL CHECK(geo IN('MX','CO','PE')),
  locale text NOT NULL CHECK((geo='MX' AND locale='mx') OR (geo='CO' AND locale='co') OR (geo='PE' AND locale='pe')),
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  priority_rank integer NOT NULL CHECK(priority_rank BETWEEN 1 AND 5),
  priority_score numeric NOT NULL,top_social boolean NOT NULL,
  canonical_url text NOT NULL CHECK(canonical_url LIKE 'https://livasports.com/'||locale||'/%'),
  intent_cluster jsonb NOT NULL,placements jsonb NOT NULL,context_localized text NOT NULL,
  score_breakdown jsonb NOT NULL DEFAULT '[]',reasons jsonb NOT NULL DEFAULT '[]',evidence jsonb NOT NULL DEFAULT '{}',
  source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(geo,fixture_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_geo_active_rank ON growth_geo_priorities(geo,priority_rank) WHERE active;
CREATE TABLE IF NOT EXISTS growth_geo_selections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  geo text NOT NULL CHECK(geo IN('MX','CO','PE')),
  fingerprint char(64) NOT NULL,
  current_list jsonb NOT NULL,previous_list jsonb NOT NULL,rotations jsonb NOT NULL,
  config_version text NOT NULL,selected_at timestamptz NOT NULL,
  CHECK(jsonb_array_length(current_list)<=5)
);
CREATE INDEX IF NOT EXISTS growth_geo_selections_recent ON growth_geo_selections(geo,selected_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS growth_geo_demand (
  geo text NOT NULL CHECK(geo IN('MX','CO','PE')),competition_slug text NOT NULL,
  evaluated_week date NOT NULL,adjustment numeric NOT NULL CHECK(adjustment BETWEEN -.12 AND .12),
  evidence jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(geo,competition_slug)
);
CREATE TABLE IF NOT EXISTS growth_geo_demand_history (
  geo text NOT NULL CHECK(geo IN('MX','CO','PE')),competition_slug text NOT NULL,evaluated_week date NOT NULL,
  previous_adjustment numeric NOT NULL,new_adjustment numeric NOT NULL CHECK(new_adjustment BETWEEN -.12 AND .12),
  evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(geo,competition_slug,evaluated_week)
);
CREATE OR REPLACE VIEW growth_geo_attribution_dimensions AS
SELECT p.fixture_id,f.public_id AS fixture_public_id,c.slug AS competition_slug,ht.public_id AS home_public_id,
  at.public_id AS away_public_id,p.canonical_url,replace(p.canonical_url,'https://livasports.com','') AS canonical_path,
  p.priority_rank,p.priority_score,p.top_social,p.placements,p.active,p.updated_at,p.geo,p.locale
FROM growth_geo_priorities p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id;
COMMIT;
