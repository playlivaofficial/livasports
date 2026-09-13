BEGIN;
ALTER TABLE profile_sponsor_campaigns ADD COLUMN delivery_type text NOT NULL DEFAULT 'IMAGE' CHECK(delivery_type IN ('IMAGE','BETSSON_EMBED'));
ALTER TABLE profile_sponsor_campaigns ADD COLUMN embed_source_url text;
ALTER TABLE profile_sponsor_campaigns ALTER COLUMN image_url DROP NOT NULL;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT sponsor_delivery_shape CHECK(
  (delivery_type='IMAGE' AND image_url IS NOT NULL AND embed_source_url IS NULL) OR
  (delivery_type='BETSSON_EMBED' AND locale='br' AND image_url IS NULL AND embed_source_url IS NOT NULL));
ALTER TABLE affiliate_clicks DROP CONSTRAINT affiliate_clicks_redirect_status_check;
ALTER TABLE affiliate_clicks ADD CONSTRAINT affiliate_clicks_redirect_status_check CHECK(redirect_status IN ('ISSUED_303','EMBED_ACTIVATION'));
COMMIT;
