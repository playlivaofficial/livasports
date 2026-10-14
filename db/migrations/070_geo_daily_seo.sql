BEGIN;
-- Additive SEO-only execution evidence. Existing rankings, experiments and commercial tables stay intact.
CREATE TABLE IF NOT EXISTS growth_geo_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 geo text NOT NULL CHECK(geo IN('MX','CO','PE')),local_day date NOT NULL,
 trigger_source text NOT NULL CHECK(trigger_source IN('AUTOMATIC','OWNER')),
 config_version text NOT NULL,state text NOT NULL CHECK(state IN('RUNNING','SUCCEEDED','FAILED','SUPERSEDED')),
 started_at timestamptz NOT NULL,finished_at timestamptz,last_checked_at timestamptz,check_count integer NOT NULL DEFAULT 0 CHECK(check_count>=0),
 considered integer NOT NULL DEFAULT 0,eligible integer NOT NULL DEFAULT 0,selected_count integer NOT NULL DEFAULT 0 CHECK(selected_count BETWEEN 0 AND 5),
 changed boolean NOT NULL DEFAULT false,selection jsonb NOT NULL DEFAULT '[]',country_evidence jsonb NOT NULL DEFAULT '{}',error_code text,
 CHECK(jsonb_typeof(selection)='array' AND jsonb_array_length(selection)<=5)
);
CREATE INDEX IF NOT EXISTS growth_geo_runs_recent ON growth_geo_runs(geo,started_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS growth_geo_runs_daily_success ON growth_geo_runs(geo,local_day,started_at DESC) WHERE state='SUCCEEDED';
COMMIT;
