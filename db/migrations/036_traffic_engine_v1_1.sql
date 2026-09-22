BEGIN;

-- V1.1 is additive. V1 content remains immutable history; newer revisions point back to it.
ALTER TABLE growth_content_items ADD COLUMN supersedes_item_id uuid REFERENCES growth_content_items(id);
ALTER TABLE growth_content_items ADD COLUMN superseded_at timestamptz;

CREATE TABLE growth_platform_assets (
  content_item_id uuid NOT NULL REFERENCES growth_content_items(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK(channel IN ('TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS')),
  status text NOT NULL CHECK(status IN ('READY','FAILED','PENDING')),
  mime_type text CHECK(mime_type IS NULL OR mime_type='video/mp4'),
  sha256 char(64) CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer CHECK(byte_length IS NULL OR byte_length>0),
  video_data bytea,
  error_code text,
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(content_item_id,channel),
  CHECK((status='READY' AND mime_type='video/mp4' AND sha256 IS NOT NULL AND byte_length IS NOT NULL AND video_data IS NOT NULL AND generated_at IS NOT NULL)
    OR (status<>'READY' AND video_data IS NULL))
);

-- One current acquisition-priority record per fixture, always produced by the shared growth scorer.
CREATE TABLE growth_seo_priorities (
  fixture_id uuid PRIMARY KEY REFERENCES fixtures(id) ON DELETE CASCADE,
  priority_rank integer NOT NULL CHECK(priority_rank>0),
  priority_score numeric NOT NULL,
  top_social boolean NOT NULL,
  canonical_url text NOT NULL CHECK(canonical_url LIKE 'https://livasports.com/%'),
  intent_cluster jsonb NOT NULL,
  placements jsonb NOT NULL,
  context_pt_br text NOT NULL,
  source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rights are explicit and deny-by-default. Existing provider portrait URLs are not silently licensed.
CREATE TABLE growth_media_rights (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source text NOT NULL,
  asset_url text NOT NULL CHECK(asset_url LIKE 'https://%'),
  license_status text NOT NULL CHECK(license_status IN ('APPROVED','REJECTED','UNKNOWN','EXPIRED')),
  commercial_eligible boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id,source),
  CHECK(NOT commercial_eligible OR license_status='APPROVED'),
  CHECK(NOT commercial_eligible OR valid_until IS NULL OR valid_until>valid_from)
);

CREATE INDEX growth_items_generator_active ON growth_content_items(generator_version,created_at DESC);
CREATE INDEX growth_items_unsuperseded ON growth_content_items(created_at DESC) WHERE superseded_at IS NULL;
CREATE INDEX growth_assets_status ON growth_platform_assets(status,updated_at DESC);
CREATE INDEX growth_seo_active_rank ON growth_seo_priorities(active,priority_rank);
CREATE INDEX growth_media_commercial ON growth_media_rights(commercial_eligible,license_status,valid_until);

-- Reporting dimensions join the existing analytics funnel; no second event store or synthetic metric is created.
CREATE VIEW growth_content_attribution_dimensions AS
SELECT i.id AS content_item_id,i.fixture_id,f.public_id AS fixture_public_id,c.slug AS competition_slug,
  ht.public_id AS home_public_id,ht.name AS home_name,at.public_id AS away_public_id,at.name AS away_name,
  ch.channel,CASE ch.channel WHEN 'TIKTOK' THEN 'tiktok' WHEN 'INSTAGRAM_REELS' THEN 'instagram'
    WHEN 'YOUTUBE_SHORTS' THEN 'youtube' ELSE 'editorial_social' END AS utm_source,
  'traffic_engine_v1'::text AS utm_campaign,'match_'||f.public_id AS utm_content,ch.tracked_url,i.canonical_url,
  i.content_pack->'story'->>'angle' AS story_angle,i.content_pack#>>ARRAY['platforms',ch.channel,'template'] AS creative_template,
  i.priority_score,i.generator_version,i.revision,i.superseded_at,i.created_at
FROM growth_content_items i JOIN growth_content_channels ch ON ch.content_item_id=i.id JOIN fixtures f ON f.id=i.fixture_id
JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id;

CREATE VIEW growth_seo_attribution_dimensions AS
SELECT p.fixture_id,f.public_id AS fixture_public_id,c.slug AS competition_slug,ht.public_id AS home_public_id,
  at.public_id AS away_public_id,p.canonical_url,replace(p.canonical_url,'https://livasports.com','') AS canonical_path,
  p.priority_rank,p.priority_score,p.top_social,p.placements,p.active,p.updated_at
FROM growth_seo_priorities p JOIN fixtures f ON f.id=p.fixture_id JOIN competitions c ON c.id=f.competition_id
JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id;

COMMIT;
