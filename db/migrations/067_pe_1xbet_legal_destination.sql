BEGIN;

-- Replaces 1xBet Peru's owner-confirmed legal placeholder with the machine-verified regulator record,
-- and records the authorised destination domain that record names.
--
-- Migration 065 recorded 1xBet Peru's legal status as owner-confirmed and deliberately asserted no
-- licence identifier, because none had been verified against a regulator at the time. It also left
-- destination_domains empty, which is why the operator could not be activated: the owner panel's
-- readiness gate requires at least one approved destination host, and activateOperator refuses with
-- DESTINATION_NOT_ALLOWLISTED without one.
--
-- Verified on 2026-10-07 against the MINCETUR register of authorisation holders
-- (https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html, served from
-- consultasenlinea.mincetur.gob.pe), reading all 95 published records:
--
--   TERMINUS PLATFORM PERU SOCIEDAD ANONIMA CERRADA
--     APUESTAS DEPORTIVAS · registro 21002610010000 · RD 4249-2024 · 24/07/2024 · VIGENTE · exp. 1644398
--     JUEGOS             · registro 11002610010000 · RD 4251-2024 · 24/07/2024 · VIGENTE · exp. 1644399
--     authorised domain: https://1xbet.pe
--
-- This is the same source and the same reference format migration 057 used for every other Peruvian
-- operator, so the domain is read off the regulator's own record rather than inferred from the brand.
--
-- Commercial state stays fail-closed on purpose: affiliate_enabled and commercial_status are not
-- touched. This migration supplies verified evidence only. Turning the Peru banners on remains an
-- explicit owner activation through /owner/commercial, which is where the private channel token is
-- supplied and where the approval is audited.
UPDATE bookmaker_geo_availability g SET
  legal_status='VERIFIED',
  legal_verified_at='2026-10-07T00:00:00Z',
  legal_reference='https://apuestasdeportivas.mincetur.gob.pe/Titulares_autorizacion.html · Terminus Platform Peru SAC · RD 4249-2024 · 21002610010000',
  destination_domains=ARRAY['1xbet.pe'],
  last_validated_at=now(),updated_at=now()
FROM bookmakers b,countries c
WHERE g.bookmaker_id=b.id AND g.country_id=c.id AND b.provider_slug='1xbet' AND c.iso2='PE';

DO $$
DECLARE bad text; domains text[];
BEGIN
  SELECT g.destination_domains INTO domains
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE b.provider_slug='1xbet' AND c.iso2='PE';
  IF domains IS NULL THEN RAISE EXCEPTION 'PE_1XBET_ROW_MISSING'; END IF;
  -- Exactly the regulator's domain, and nothing resembling a Brazilian or generic 1xBet host.
  IF domains<>ARRAY['1xbet.pe'] THEN RAISE EXCEPTION 'PE_1XBET_DESTINATION_UNEXPECTED: %',array_to_string(domains,', '); END IF;

  -- Recording legal evidence must not activate anything.
  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2='PE' AND (g.affiliate_enabled OR g.commercial_status<>'CANDIDATE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PE_COMMERCIAL_MUST_STAY_FAIL_CLOSED: %',bad; END IF;

  -- Brazil keeps no 1xBet destination. A Peruvian licence authorises nothing outside Peru.
  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2<>'PE' AND b.provider_slug='1xbet' AND '1xbet.pe'=ANY(g.destination_domains);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PE_DESTINATION_LEAKED_ACROSS_GEO: %',bad; END IF;
END $$;

COMMIT;
