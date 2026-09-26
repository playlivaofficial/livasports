BEGIN;

-- Search Console Search Analytics history. Additive only.
--
-- One normalized table rather than a table per report: every view the owner dashboard needs (totals,
-- pages, queries, countries, devices, 7d/28d comparisons, locale and Brazil breakdowns) is a filter on
-- (dimension, key) over a date range, so the same day is never stored twice in different shapes.
--
-- `dimension` is the breakdown the row belongs to and `key` its value: TOTAL carries '' , PAGE a URL,
-- QUERY a search term, COUNTRY an ISO-3 code as Search Console reports it (Brazil is 'bra'), DEVICE one
-- of Google's device classes. Rows are per day, which is what makes complete-day windows exact.
CREATE TABLE IF NOT EXISTS seo_search_daily (
  property text NOT NULL,
  day date NOT NULL,
  dimension text NOT NULL CHECK(dimension IN ('TOTAL','PAGE','QUERY','COUNTRY','DEVICE')),
  key text NOT NULL DEFAULT '',
  clicks integer NOT NULL CHECK(clicks>=0),
  impressions integer NOT NULL CHECK(impressions>=0),
  -- Stored as Google reports them. CTR is recomputed from clicks/impressions when aggregating a window,
  -- because averaging a ratio across days is not the same number.
  ctr double precision NOT NULL,
  position double precision NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  -- Re-ingesting a day updates in place, so a retry or an overlapping run cannot double-count.
  PRIMARY KEY(property,day,dimension,key)
);
CREATE INDEX IF NOT EXISTS seo_search_daily_day ON seo_search_daily(day DESC);
CREATE INDEX IF NOT EXISTS seo_search_daily_dimension ON seo_search_daily(dimension,day DESC);
CREATE INDEX IF NOT EXISTS seo_search_daily_key ON seo_search_daily(dimension,key);

-- Sitemap metadata exactly as Search Console records it. `submitted` is how many URLs Google read from
-- the sitemap; it is NOT an indexed count, and the Page Indexing report has no public API.
CREATE TABLE IF NOT EXISTS seo_sitemap_status (
  property text NOT NULL,
  path text NOT NULL,
  captured_day date NOT NULL,
  last_submitted timestamptz,
  last_downloaded timestamptz,
  is_pending boolean,
  warnings integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  submitted integer NOT NULL DEFAULT 0,
  indexed integer,
  PRIMARY KEY(property,path,captured_day)
);

-- Per-run ingestion outcome, so a Search Console outage is visible as an outage rather than as zero data.
CREATE TABLE IF NOT EXISTS seo_gsc_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  property text NOT NULL,
  state text NOT NULL,
  days_ingested integer NOT NULL DEFAULT 0,
  rows_ingested integer NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  error_code text
);
CREATE INDEX IF NOT EXISTS seo_gsc_syncs_started ON seo_gsc_syncs(started_at DESC);

COMMIT;
