BEGIN;

-- Adds 1xBet Peru's affiliate tracking host to its approved destination allowlist.
--
-- Migration 067 recorded the operator's licensed domain, 1xbet.pe, from the MINCETUR register. That
-- is the brand's own site, but it is not where an affiliate link points. The 1xBet Partners Peru
-- panel generates outbound links on a separate tracking host:
--
--   https://1xaff.pe/L?tag=<channel token>&site=<publisher site id>&ad=<campaign id>
--
-- confirmed on 2026-10-07 by generating a direct link on the authenticated account (Aff ID 4884063)
-- for the registered website http://livasports.com, which the panel lists under site id 6175483 --
-- the same publisher id the approved banner iframe carries. This mirrors Brazil, where the approved
-- 1xBet links already use 1xaff.com.br rather than the brand domain.
--
-- Both hosts are kept: 1xbet.pe is the licensed operator domain the regulator names, and 1xaff.pe is
-- the tracking host an approved campaign actually resolves to. A destination allowlist authorises
-- nothing by itself; an outbound link still needs an approved campaign row, and the commercial state
-- below is left untouched so activation remains an explicit, audited owner action.
UPDATE bookmaker_geo_availability g SET
  destination_domains=ARRAY['1xbet.pe','1xaff.pe'],
  last_validated_at=now(),updated_at=now()
FROM bookmakers b,countries c
WHERE g.bookmaker_id=b.id AND g.country_id=c.id AND b.provider_slug='1xbet' AND c.iso2='PE';

DO $$
DECLARE domains text[]; bad text;
BEGIN
  SELECT g.destination_domains INTO domains
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE b.provider_slug='1xbet' AND c.iso2='PE';
  IF domains IS NULL THEN RAISE EXCEPTION 'PE_1XBET_ROW_MISSING'; END IF;
  IF NOT ('1xaff.pe'=ANY(domains) AND '1xbet.pe'=ANY(domains)) OR cardinality(domains)<>2
    THEN RAISE EXCEPTION 'PE_1XBET_DESTINATION_UNEXPECTED: %',array_to_string(domains,', '); END IF;

  -- The Peru tracking host must never appear outside Peru, and Brazil keeps its own.
  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2<>'PE' AND '1xaff.pe'=ANY(g.destination_domains);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PE_TRACKING_HOST_LEAKED_ACROSS_GEO: %',bad; END IF;
END $$;

COMMIT;
