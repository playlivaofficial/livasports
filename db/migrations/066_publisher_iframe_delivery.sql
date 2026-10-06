BEGIN;

-- Admits ONE_XBET_IFRAME as a third creative delivery, for the 1xBet Peru partner iframe.
--
-- Two shape rules change, and nothing else:
--
--  1. delivery_type gains exactly one new literal. It is an explicit type rather than a reuse of
--     BETSSON_EMBED, because the two are validated by different contracts and rendered under
--     different Content-Security-Policies. Overloading BETSSON_EMBED would have let a Bannerflow
--     creative be served as an iframe and vice versa.
--
--  2. sponsor_delivery_shape still demands image_url IS NULL and embed_source_url IS NOT NULL for
--     every embed, and additionally pins ONE_XBET_IFRAME to Peru. It also drops the stale locale='br'
--     restriction on BETSSON_EMBED: migration 013 predates MX/CO/PE, where Betsson Mexico, Betsson
--     Colombia and Inkabet Peru all serve Bannerflow embeds, so that clause would have rejected every
--     core-GEO banner. Replacing it with the four supported locales keeps the constraint meaningful
--     rather than simply removing it.
--
-- The per-channel token inside embed_source_url is private configuration supplied through the owner
-- activation path. It is not written here and never appears in a migration.
-- Migration 013 declared the delivery literals as an inline column CHECK, so the constraint carries
-- whatever name Postgres generated. Resolve it instead of assuming it, so this migration cannot fail
-- on a database where that name differs.
DO $$
DECLARE name text;
BEGIN
  SELECT conname INTO name FROM pg_constraint
  WHERE conrelid='profile_sponsor_campaigns'::regclass AND contype='c' AND conname<>'sponsor_delivery_shape'
    AND pg_get_constraintdef(oid) LIKE '%delivery_type%';
  IF name IS NULL THEN RAISE EXCEPTION 'DELIVERY_TYPE_CHECK_NOT_FOUND'; END IF;
  EXECUTE format('ALTER TABLE profile_sponsor_campaigns DROP CONSTRAINT %I',name);
END $$;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT profile_sponsor_campaigns_delivery_type_check
  CHECK(delivery_type IN ('IMAGE','BETSSON_EMBED','ONE_XBET_IFRAME'));

ALTER TABLE profile_sponsor_campaigns DROP CONSTRAINT sponsor_delivery_shape;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT sponsor_delivery_shape CHECK(
  (delivery_type='IMAGE' AND image_url IS NOT NULL AND embed_source_url IS NULL) OR
  (delivery_type='BETSSON_EMBED' AND locale IN ('br','mx','co','pe') AND image_url IS NULL AND embed_source_url IS NOT NULL) OR
  (delivery_type='ONE_XBET_IFRAME' AND locale='pe' AND image_url IS NULL AND embed_source_url IS NOT NULL));

-- Every existing row must already satisfy the new shape; a surviving violation means an earlier
-- migration or manual edit wrote a creative the application could never have served.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(id||'/'||locale||'/'||delivery_type,', ') INTO bad FROM profile_sponsor_campaigns
  WHERE NOT (
    (delivery_type='IMAGE' AND image_url IS NOT NULL AND embed_source_url IS NULL) OR
    (delivery_type='BETSSON_EMBED' AND locale IN ('br','mx','co','pe') AND image_url IS NULL AND embed_source_url IS NOT NULL) OR
    (delivery_type='ONE_XBET_IFRAME' AND locale='pe' AND image_url IS NULL AND embed_source_url IS NOT NULL));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'SPONSOR_DELIVERY_SHAPE_VIOLATION: %',bad; END IF;

  -- The iframe delivery exists for 1xBet Peru alone. Any row that reaches it through another
  -- operator is a misconfiguration, so fail the migration rather than let it serve.
  SELECT string_agg(s.id||'/'||b.provider_slug,', ') INTO bad
  FROM profile_sponsor_campaigns s
  JOIN affiliate_campaigns ac ON ac.id=s.affiliate_campaign_id
  JOIN affiliate_links al ON al.id=ac.affiliate_link_id
  JOIN bookmakers b ON b.id=al.bookmaker_id
  WHERE s.delivery_type='ONE_XBET_IFRAME' AND b.provider_slug<>'1xbet';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'IFRAME_DELIVERY_RESTRICTED_TO_1XBET: %',bad; END IF;
END $$;

COMMIT;
