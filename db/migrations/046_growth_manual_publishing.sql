BEGIN;

-- Append-only evidence for a deliberate owner action. Channel status remains the sole mutable lifecycle.
CREATE TABLE IF NOT EXISTS growth_manual_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES growth_content_items(id),
  fixture_id uuid NOT NULL REFERENCES fixtures(id),
  channel text NOT NULL CHECK(channel IN ('TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS')),
  content_identity text NOT NULL,
  creative_version text NOT NULL,
  asset_sha256 text NOT NULL CHECK(asset_sha256 ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by text NOT NULL CHECK(posted_by ~ '^[a-f0-9]{64}$'),
  external_post_url text CHECK(length(external_post_url)<=1000 AND external_post_url LIKE 'https://%'),
  notes text CHECK(length(notes)<=500),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  FOREIGN KEY(content_item_id,channel) REFERENCES growth_content_channels(content_item_id,channel),
  UNIQUE(fixture_id,channel,content_identity,creative_version),
  UNIQUE(content_item_id,channel)
);
CREATE INDEX IF NOT EXISTS growth_manual_posts_channel_time ON growth_manual_posts(channel,posted_at DESC,id);
CREATE INDEX IF NOT EXISTS growth_manual_posts_time ON growth_manual_posts(posted_at DESC,id);
CREATE INDEX IF NOT EXISTS growth_manual_posts_version ON growth_manual_posts(creative_version,posted_at DESC);
CREATE INDEX IF NOT EXISTS growth_manual_posts_attribution ON growth_manual_posts((snapshot->>'utmSource'),(snapshot->>'utmContent'));

-- Preserve legacy fixture-level links, and add exact creative-level links to the SAME reporting dimension.
CREATE OR REPLACE VIEW growth_content_attribution_dimensions AS
SELECT i.id AS content_item_id,i.fixture_id,f.public_id AS fixture_public_id,c.slug AS competition_slug,
  ht.public_id AS home_public_id,ht.name AS home_name,at.public_id AS away_public_id,at.name AS away_name,
  ch.channel,CASE ch.channel WHEN 'TIKTOK' THEN 'tiktok' WHEN 'INSTAGRAM_REELS' THEN 'instagram'
    WHEN 'YOUTUBE_SHORTS' THEN 'youtube' ELSE 'editorial_social' END AS utm_source,
  'traffic_engine_v1'::text AS utm_campaign,'match_'||f.public_id AS utm_content,ch.tracked_url,i.canonical_url,
  i.content_pack->'story'->>'angle' AS story_angle,i.content_pack#>>ARRAY['platforms',ch.channel,'template'] AS creative_template,
  i.priority_score,i.generator_version,i.revision,i.superseded_at,i.created_at
FROM growth_content_items i JOIN growth_content_channels ch ON ch.content_item_id=i.id JOIN fixtures f ON f.id=i.fixture_id
JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
UNION ALL
SELECT i.id,i.fixture_id,f.public_id,c.slug,ht.public_id,ht.name,at.public_id,at.name,p.channel,
  p.snapshot->>'utmSource',p.snapshot->>'utmCampaign',p.snapshot->>'utmContent',p.snapshot->>'trackedUrl',i.canonical_url,
  p.snapshot->>'storyAngle',i.content_pack#>>ARRAY['platforms',p.channel,'template'],i.priority_score,i.generator_version,
  i.revision,i.superseded_at,i.created_at
FROM growth_manual_posts p JOIN growth_content_items i ON i.id=p.content_item_id JOIN fixtures f ON f.id=i.fixture_id
JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id;

COMMIT;
