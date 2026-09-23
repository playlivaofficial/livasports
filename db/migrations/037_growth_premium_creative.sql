BEGIN;

ALTER TABLE growth_platform_assets ADD COLUMN render_metadata jsonb;

-- History derives from immutable revisions. No second event store or destructive rewrite.
CREATE VIEW growth_creative_history AS
SELECT i.id AS content_item_id,i.fixture_id,i.revision,i.created_at,i.superseded_at,
  ch.channel,ch.status,
  i.content_pack#>>ARRAY['platforms',ch.channel,'creative','version'] AS creative_version,
  i.content_pack#>>ARRAY['platforms',ch.channel,'creative','hookFamily'] AS hook_family,
  i.content_pack#>>ARRAY['platforms',ch.channel,'creative','ctaFamily'] AS cta_family,
  i.content_pack#>ARRAY['platforms',ch.channel,'creative'] AS creative,
  a.render_metadata
FROM growth_content_items i JOIN growth_content_channels ch ON ch.content_item_id=i.id
LEFT JOIN growth_platform_assets a ON a.content_item_id=i.id AND a.channel=ch.channel;

COMMIT;
