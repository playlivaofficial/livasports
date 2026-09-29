BEGIN;
-- Additive only. Product data, old experiments and publication/indexability policy remain intact.
ALTER TABLE seo_autopilot_pages ADD COLUMN IF NOT EXISTS link_boost integer NOT NULL DEFAULT 0 CHECK(link_boost BETWEEN 0 AND 5);
ALTER TABLE seo_autopilot_pages ADD COLUMN IF NOT EXISTS link_boost_until timestamptz;
ALTER TABLE seo_autopilot_pages ADD COLUMN IF NOT EXISTS intent_focus text CHECK(intent_focus IN('H2H','FORM','STANDINGS','SCHEDULE','GENERAL'));
ALTER TABLE seo_autopilot_pages ADD COLUMN IF NOT EXISTS optimization_metadata jsonb;
CREATE TABLE IF NOT EXISTS seo_growth_snapshots (
 day date PRIMARY KEY, mode text NOT NULL CHECK(mode IN('ACTIVE','OBSERVE_ONLY')),
 report jsonb NOT NULL, config_version text NOT NULL, captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seo_growth_experiments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort text NOT NULL, kind text NOT NULL CHECK(kind IN('TITLE_PATTERN','INTERNAL_LINK_BOOST')),
 page text NOT NULL, control_page text NOT NULL CHECK(page<>control_page), state text NOT NULL DEFAULT 'OBSERVING' CHECK(state IN('OBSERVING','COMPLETE','FROZEN')),
 started_at timestamptz NOT NULL, observation_start date NOT NULL, baseline jsonb NOT NULL,
 previous_value jsonb NOT NULL, new_value jsonb NOT NULL, confidence text NOT NULL CHECK(confidence IN('MEDIUM','HIGH')),
 reason text NOT NULL, release_sha text, frozen_until timestamptz, last_measured_at timestamptz,
 UNIQUE(cohort,page)
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_growth_active_page ON seo_growth_experiments(page) WHERE state IN('OBSERVING','FROZEN');
CREATE TABLE IF NOT EXISTS seo_growth_observations (
 experiment_id uuid NOT NULL REFERENCES seo_growth_experiments(id), window_days integer NOT NULL CHECK(window_days IN(7,14,28)),
 from_day date NOT NULL,to_day date NOT NULL,metrics jsonb NOT NULL,assessment text NOT NULL,measured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(experiment_id,window_days)
);
CREATE TABLE IF NOT EXISTS seo_growth_actions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, action_key text NOT NULL UNIQUE, day date NOT NULL,
 url text NOT NULL, action text NOT NULL, outcome text NOT NULL, reason text NOT NULL, confidence text NOT NULL,
 detector text NOT NULL, previous_value jsonb NOT NULL,new_value jsonb NOT NULL,evidence jsonb NOT NULL,
 experiment_id uuid REFERENCES seo_growth_experiments(id),config_version text NOT NULL,release_sha text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_growth_actions_day ON seo_growth_actions(day,action,outcome);
CREATE TABLE IF NOT EXISTS seo_growth_cluster_weights (
 cluster text PRIMARY KEY,adjustment integer NOT NULL CHECK(adjustment BETWEEN -3 AND 3),
 evaluated_week date NOT NULL,evidence jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seo_growth_weekly (
 week date PRIMARY KEY, report jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
