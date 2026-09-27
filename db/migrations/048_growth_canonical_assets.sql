BEGIN;
-- New assets only. Never relabel or rewrite historical platform-specific media.
CREATE TABLE IF NOT EXISTS growth_canonical_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES growth_content_items(id),
  kind text NOT NULL CHECK(kind IN ('MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE')),
  creative_version text NOT NULL,
  mime_type text NOT NULL CHECK(mime_type IN ('video/mp4','image/png')),
  width integer NOT NULL CHECK(width=1080),
  height integer NOT NULL CHECK(height IN (1920,1350)),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer NOT NULL CHECK(byte_length>0 AND byte_length<=4000000),
  asset_data bytea NOT NULL,
  render_metadata jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(content_item_id,kind),
  CHECK(octet_length(asset_data)=byte_length),
  CHECK((kind='MASTER_VIDEO' AND mime_type='video/mp4' AND height=1920) OR
    (kind='STORY_IMAGE' AND mime_type='image/png' AND height=1920) OR
    (kind='FEED_IMAGE' AND mime_type='image/png' AND height=1350))
);
ALTER TABLE growth_manual_posts ADD COLUMN IF NOT EXISTS canonical_asset_id uuid REFERENCES growth_canonical_assets(id);
-- Atomic uniqueness complements the generation-job lease and per-fixture advisory lock.
CREATE UNIQUE INDEX IF NOT EXISTS growth_master_identity ON growth_content_items(fixture_id,creative_version,content_identity)
  WHERE content_pack->>'assetModel'='MASTER_V1';
COMMIT;
