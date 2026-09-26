BEGIN;

-- Growth creative lifecycle. Additive only; no existing row is deleted and no media is discarded.
--
-- Duplicate prevention keyed on fixture + recency alone, so a fixture that had ever been generated was
-- skipped forever. The Premium Motion renderer shipped on 2026-09-24 and six successful scheduler runs
-- later the owner queue was still serving assets from the previous stack. These columns make generation
-- and the owner read model version-aware.

-- Which creative stack produced this item/asset. Historical rows are explicitly LEGACY: they are kept and
-- remain readable as history, but they are never treated as current.
ALTER TABLE growth_content_items ADD COLUMN IF NOT EXISTS creative_version text;
ALTER TABLE growth_platform_assets ADD COLUMN IF NOT EXISTS creative_version text;

-- Churn-free fingerprint of the facts the creative actually renders. source_hash stays as provenance; it
-- also mixes in the live priority score, which moves every run and would rerender unchanged videos.
ALTER TABLE growth_content_items ADD COLUMN IF NOT EXISTS content_identity text;

-- CURRENT queue markers. History is every row; "current" is the latest recomputed Top 10, rebuilt on every
-- scheduler run. Dropping out of the Top 10 clears these and deletes nothing.
ALTER TABLE growth_content_items ADD COLUMN IF NOT EXISTS current_rank integer;
ALTER TABLE growth_content_items ADD COLUMN IF NOT EXISTS current_shortlist boolean NOT NULL DEFAULT false;
ALTER TABLE growth_content_items ADD COLUMN IF NOT EXISTS current_at timestamptz;

UPDATE growth_content_items SET creative_version='LEGACY_PRE_CREATIVE_VERSION' WHERE creative_version IS NULL;
UPDATE growth_platform_assets SET creative_version=COALESCE(render_metadata->'motion'->>'version','LEGACY_PRE_CREATIVE_VERSION')
  WHERE creative_version IS NULL;

CREATE INDEX IF NOT EXISTS growth_items_creative_version ON growth_content_items(fixture_id,creative_version);
CREATE INDEX IF NOT EXISTS growth_items_content_identity ON growth_content_items(content_identity);
-- Partial index: the current queue is at most a handful of rows out of the whole history.
CREATE INDEX IF NOT EXISTS growth_items_current_rank ON growth_content_items(current_rank) WHERE current_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS growth_assets_creative_version ON growth_platform_assets(creative_version);

COMMIT;
