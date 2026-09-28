BEGIN;
-- Additive only: historical bytes are retained, never certified retroactively.
-- Platform proofs live in the existing canonical MASTER_VIDEO render_metadata JSON.
-- No per-platform video/cover blobs: the existing canonical kind uniqueness remains authoritative.
CREATE UNIQUE INDEX IF NOT EXISTS growth_social_identity ON growth_content_items(fixture_id,creative_version,content_identity)
  WHERE content_pack->>'assetModel'='SOCIAL_V2';
COMMIT;
