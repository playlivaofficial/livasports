BEGIN;

-- Traffic Engine V1 stores generated editorial material only. Canonical sports, odds and analytics
-- remain in their existing tables and are referenced rather than copied.
CREATE TABLE IF NOT EXISTS growth_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision>0),
  generator_version integer NOT NULL CHECK(generator_version>0),
  source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  trigger_source text NOT NULL CHECK(trigger_source IN ('AUTOMATIC','OWNER')),
  priority_score numeric NOT NULL,
  score_breakdown jsonb NOT NULL,
  ranking_reasons jsonb NOT NULL,
  fixture_snapshot jsonb NOT NULL,
  content_pack jsonb NOT NULL,
  canonical_url text NOT NULL CHECK(canonical_url LIKE 'https://livasports.com/%'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fixture_id,revision)
);

CREATE TABLE IF NOT EXISTS growth_content_channels (
  content_item_id uuid NOT NULL REFERENCES growth_content_items(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK(channel IN ('TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS','EDITORIAL')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REJECTED','PUBLISHED')),
  tracked_url text NOT NULL CHECK(tracked_url LIKE 'https://livasports.com/%'),
  approved_at timestamptz,
  rejected_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(content_item_id,channel)
);

CREATE TABLE IF NOT EXISTS growth_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED')),
  trigger_source text NOT NULL CHECK(trigger_source IN ('AUTOMATIC','OWNER')),
  lease_expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  considered integer NOT NULL DEFAULT 0,
  generated integer NOT NULL DEFAULT 0,
  skipped_duplicate integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_generation_one_running
  ON growth_generation_jobs((status)) WHERE status='RUNNING';
CREATE INDEX IF NOT EXISTS growth_items_fixture_created
  ON growth_content_items(fixture_id,created_at DESC);
CREATE INDEX IF NOT EXISTS growth_items_created
  ON growth_content_items(created_at DESC);
CREATE INDEX IF NOT EXISTS growth_channels_status
  ON growth_content_channels(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS growth_jobs_started
  ON growth_generation_jobs(started_at DESC);

COMMIT;
