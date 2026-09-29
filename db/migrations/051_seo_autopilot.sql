BEGIN;
-- Additive SEO-only state. No sports, odds, users, social assets or provider tables are rewritten.
CREATE TABLE IF NOT EXISTS seo_autopilot_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL, state text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, lease_until timestamptz NOT NULL,
 summary jsonb NOT NULL DEFAULT '{}', config_version text NOT NULL, release_sha text
);
CREATE INDEX IF NOT EXISTS seo_autopilot_runs_day ON seo_autopilot_runs(day,started_at DESC);
CREATE TABLE IF NOT EXISTS seo_autopilot_pages (
 fixture_id uuid PRIMARY KEY REFERENCES fixtures(id), url text NOT NULL UNIQUE, locale text NOT NULL DEFAULT 'br' CHECK(locale='br'),
 score double precision NOT NULL CHECK(score BETWEEN 0 AND 100), tier text NOT NULL CHECK(tier IN ('A','B','C')),
 state text NOT NULL CHECK(state IN ('PUBLISHED','BLOCKED','PRODUCT_ONLY','NOINDEX','RETRYABLE_DATA_GAP')),
 evidence jsonb NOT NULL, reasons jsonb NOT NULL, links jsonb NOT NULL DEFAULT '[]',
 content_hash text NOT NULL, content_changed_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, checked_at timestamptz NOT NULL DEFAULT now(),
 retain_indexable boolean NOT NULL DEFAULT false,
 title text, description text, metadata_changed_at timestamptz, config_version text NOT NULL
);
CREATE INDEX IF NOT EXISTS seo_autopilot_pages_priority ON seo_autopilot_pages(state,score DESC);
CREATE TABLE IF NOT EXISTS seo_autopilot_decisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id uuid NOT NULL REFERENCES seo_autopilot_runs(id),
 url text NOT NULL, action text NOT NULL, reason text NOT NULL, previous_state jsonb, new_state jsonb NOT NULL,
 signals jsonb NOT NULL, config_version text NOT NULL, release_sha text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,url,action)
);
CREATE TABLE IF NOT EXISTS seo_autopilot_clusters (
 cluster text PRIMARY KEY, boost integer NOT NULL CHECK(boost BETWEEN 0 AND 5),
 evidence jsonb NOT NULL, evaluated_week date NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seo_autopilot_sitemaps (
 path text PRIMARY KEY, content_hash text NOT NULL, content_changed_at timestamptz NOT NULL,
 submitted_hash text, submitted_at timestamptz, attempted_at timestamptz, state text NOT NULL, error_code text
);
CREATE TABLE IF NOT EXISTS seo_autopilot_technical (
 url text PRIMARY KEY, status integer NOT NULL, problems jsonb NOT NULL, audit jsonb NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
