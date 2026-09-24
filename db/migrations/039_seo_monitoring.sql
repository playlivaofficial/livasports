BEGIN;

-- SEO monitoring: daily technical snapshots of our own submitted inventory plus the alerts derived from
-- comparing a snapshot with the previous one. Additive only; nothing existing is altered.
-- Search Console metrics are NOT stored here yet: no Search Console credential exists, so the connector
-- reports NOT_CONNECTED rather than writing placeholder numbers. The gsc_* columns are the landing place
-- for that data once a property-scoped credential is configured, and stay NULL until then.
CREATE TABLE IF NOT EXISTS seo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  -- One row per local day keeps the job idempotent: a second run on the same day updates in place.
  captured_day date NOT NULL,
  source text NOT NULL DEFAULT 'TECHNICAL' CHECK(source IN ('TECHNICAL','GSC')),
  submitted_total integer NOT NULL CHECK(submitted_total>=0),
  families jsonb NOT NULL DEFAULT '{}'::jsonb,
  locales jsonb NOT NULL DEFAULT '{}'::jsonb,
  sampled integer NOT NULL DEFAULT 0 CHECK(sampled>=0),
  problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  problem_count integer NOT NULL DEFAULT 0 CHECK(problem_count>=0),
  robots_ok boolean,
  gsc_state text NOT NULL DEFAULT 'NOT_CONNECTED',
  gsc_metrics jsonb,
  duration_ms integer,
  UNIQUE(captured_day,source)
);
CREATE INDEX IF NOT EXISTS seo_snapshots_captured ON seo_snapshots(captured_at DESC);

CREATE TABLE IF NOT EXISTS seo_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES seo_snapshots(id) ON DELETE CASCADE,
  raised_at timestamptz NOT NULL DEFAULT now(),
  code text NOT NULL CHECK(length(code)<=60),
  severity text NOT NULL CHECK(severity IN ('CRITICAL','WARNING','INFO')),
  -- Empty string rather than NULL: Postgres treats NULLs as distinct, which would break the ON CONFLICT dedupe.
  url_family text NOT NULL DEFAULT '',
  reason text NOT NULL CHECK(length(reason)<=400),
  current_value text,
  baseline_value text,
  -- The same condition on the same day is one alert, so a retried job never duplicates it.
  UNIQUE(snapshot_id,code,url_family)
);
CREATE INDEX IF NOT EXISTS seo_alerts_raised ON seo_alerts(raised_at DESC);

COMMIT;
