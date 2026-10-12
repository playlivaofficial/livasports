BEGIN;

-- Mexico gains Winpot as a second real odds source and second desktop sponsor; Colombia's bwin
-- gains its Entain Partners banners. Peru is not touched, and a guard below proves it.
--
-- 1. Winpot Mexico odds. Entitlement verified on the authenticated OddsPapi account on 2026-10-12:
--    plan Normal, window 2026-10-02 -> 2026-11-02, soccer only, bookmakers betsson, bwin, inkabet,
--    1xbet and winpot.mx, every one pregame-only (no live odds, no player props). The live catalog
--    lists winpot.mx as "Winpot MX", cloneOf 'lottoland', active, country mx. One Liga MX request
--    (tournament 27464) returned 9 of 9 fixtures priced, bookmakerIsActive true on all 9, 2159 of
--    2159 prices active, markets 101 (MATCH_WINNER), 104 (BTTS) and 1010 (TOTAL_GOALS) present, and
--    fixturePath on www.lottoland.com. On the 8 fixtures Betsson also priced, 0 of 24 1X2 prices were
--    identical, so this is a genuine comparison rather than a Betsson mirror the way Inkabet is.
--
--    Legal evidence is recorded the way migration 063 recorded Betsson Mexico: the SEGOB portal is
--    not reachable from the build environment, so the operator's own regulator statement is cited and
--    the owner confirmed Winpot as the Mexico pricing and commercial brand on 2026-10-12.
INSERT INTO bookmakers(provider_slug,display_name,enabled,comparison_enabled,affiliate_status,logo_ref)
VALUES ('winpot.mx','Winpot',true,true,'NOT_APPLIED','/bookmakers/winpot.webp')
ON CONFLICT(provider_slug) DO UPDATE SET display_name='Winpot',enabled=true,comparison_enabled=true,logo_ref=excluded.logo_ref,updated_at=now();

INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,odds_enabled,comparison_enabled,sportsbook_enabled,
  affiliate_enabled,commercial_status,legal_status,legal_verified_at,legal_reference,verification_state,verified_at,
  source_domains,destination_domains,currency,public_priority,last_validated_at)
SELECT b.id,c.id,true,true,true,
  false,'CANDIDATE','VERIFIED','2026-10-12T00:00:00Z',
  'SEGOB/DGJS owner-confirmed 2026-10-12 · winpot.mx operated by Winpot Online America S.A. de C.V., operadora de Pur Umazal Tov, S.A. de C.V. · permiso DGJS/DGAFJ/DCRCA/P-08/2014 · autorizaciones DGJS/393/2018, DGJS/1130/2022, DGJS/1681/2023, DGJS/1807/2023 · source: regulator statement in the winpot.mx site footer',
  'VERIFIED_MX',now(),
  ARRAY['www.lottoland.com'],ARRAY['winpot.mx','www.winpot.mx','sport.winpot.mx'],'MXN',20,now()
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug='winpot.mx' AND c.iso2='MX'
ON CONFLICT(bookmaker_id,country_id) DO UPDATE SET
  odds_enabled=true,comparison_enabled=true,sportsbook_enabled=true,
  legal_status='VERIFIED',legal_verified_at=excluded.legal_verified_at,legal_reference=excluded.legal_reference,
  verification_state='VERIFIED_MX',verified_at=COALESCE(bookmaker_geo_availability.verified_at,now()),
  source_domains=excluded.source_domains,destination_domains=excluded.destination_domains,
  currency=COALESCE(bookmaker_geo_availability.currency,'MXN'),last_validated_at=now(),updated_at=now();

-- Verified OddsPapi mapping. The identifier is the one the live catalog and subscription return.
INSERT INTO operator_provider_mappings(bookmaker_id,country_id,provider,provider_bookmaker_id,verified_at,evidence)
SELECT b.id,c.id,'ODDSPAPI','winpot.mx','2026-10-12T11:00:00Z','{"verifiedOn":"2026-10-12","catalogName":"Winpot MX","cloneOf":"lottoland","catalogCountries":["mx"],"sourceDomainObserved":"www.lottoland.com","hasLiveOdds":false,"hasPlayerProps":false,"subscriptionWindow":"2026-10-02/2026-11-02","sportIds":[10],"tournamentObserved":27464,"tournamentName":"Liga MX","fixturesWithOdds":9,"fixturesReturned":9,"marketsObserved":["101","104","1010"],"bookmakerIsActiveTrue":9,"pricesActive":"2159/2159","betssonIdentical1x2":"0/24"}'::jsonb
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug='winpot.mx' AND c.iso2='MX'
ON CONFLICT(bookmaker_id,country_id,provider,provider_bookmaker_id)
 DO UPDATE SET verified_at=excluded.verified_at,evidence=excluded.evidence;

-- 2. Admit ENTAIN_IFRAME, the Entain Partners zone iframe, pinned to Colombia exactly as 066 pinned
--    ONE_XBET_IFRAME to Peru. No other delivery rule changes. Zone ids are public placement ids
--    (they appear in the generated iframe's own id); no token is written here.
ALTER TABLE profile_sponsor_campaigns DROP CONSTRAINT profile_sponsor_campaigns_delivery_type_check;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT profile_sponsor_campaigns_delivery_type_check
  CHECK(delivery_type IN ('IMAGE','BETSSON_EMBED','ONE_XBET_IFRAME','ENTAIN_IFRAME'));
ALTER TABLE profile_sponsor_campaigns DROP CONSTRAINT sponsor_delivery_shape;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT sponsor_delivery_shape CHECK(
  (delivery_type='IMAGE' AND image_url IS NOT NULL AND embed_source_url IS NULL) OR
  (delivery_type='BETSSON_EMBED' AND locale IN ('br','mx','co','pe') AND image_url IS NULL AND embed_source_url IS NOT NULL) OR
  (delivery_type='ONE_XBET_IFRAME' AND locale='pe' AND image_url IS NULL AND embed_source_url IS NOT NULL) OR
  (delivery_type='ENTAIN_IFRAME' AND locale='co' AND image_url IS NULL AND embed_source_url IS NOT NULL));

-- 3. The desktop right rail moves to each jurisdiction's second operator: Winpot in Mexico, bwin in
--    Colombia. Desktop placements never share (resolveOffer fails closed on two matches), so Betsson's
--    Mexico and Colombia right-rail creatives are switched off. Their top banners and mobile creatives
--    stay exactly as they are. This only disables rows; re-enabling them is a single owner action.
UPDATE profile_sponsor_campaigns s SET enabled=false,updated_at=now()
FROM affiliate_campaigns ac JOIN affiliate_links al ON al.id=ac.affiliate_link_id
  JOIN bookmakers b ON b.id=al.bookmaker_id JOIN countries c ON c.id=al.country_id
WHERE s.affiliate_campaign_id=ac.id AND b.provider_slug='betsson' AND c.iso2 IN ('MX','CO')
  AND s.placement IN ('home_right_rail','match_right_rail') AND s.enabled;

DO $$
DECLARE bad text;
BEGIN
  -- Mexico's odds pool is exactly Betsson and Winpot.
  SELECT string_agg(b.provider_slug,', ' ORDER BY b.provider_slug) INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  JOIN operator_provider_mappings m ON m.bookmaker_id=b.id AND m.country_id=c.id AND m.verified_at IS NOT NULL
  WHERE c.iso2='MX' AND g.odds_enabled AND g.comparison_enabled AND b.enabled;
  IF bad IS DISTINCT FROM 'betsson, winpot.mx' THEN RAISE EXCEPTION 'MX_ODDS_POOL_UNEXPECTED: %',bad; END IF;

  -- One provider feed must never resolve to two operators.
  SELECT string_agg(provider_bookmaker_id,', ') INTO bad FROM (
    SELECT m.provider_bookmaker_id FROM operator_provider_mappings m JOIN bookmakers b ON b.id=m.bookmaker_id
    WHERE m.provider='ODDSPAPI' AND m.verified_at IS NOT NULL GROUP BY m.provider_bookmaker_id HAVING count(DISTINCT b.provider_slug)>1) x;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ODDS_AMBIGUOUS_OPERATOR_FEED: %',bad; END IF;

  -- Recording evidence must not activate anything: Winpot's banner is an explicit owner activation.
  SELECT string_agg(c.iso2,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE b.provider_slug='winpot.mx' AND (g.affiliate_enabled OR g.commercial_status<>'CANDIDATE' OR c.iso2<>'MX');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'WINPOT_MUST_STAY_MX_AND_FAIL_CLOSED: %',bad; END IF;

  -- Peru is unchanged: its odds pool is still Inkabet and 1xBet only.
  SELECT string_agg(b.provider_slug,', ' ORDER BY b.provider_slug) INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2='PE' AND g.odds_enabled AND b.provider_slug NOT IN ('inkabet','1xbet');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PE_ODDS_POOL_UNEXPECTED: %',bad; END IF;

  -- Every existing creative satisfies the widened shape, and the Entain delivery belongs to bwin.
  SELECT string_agg(s.id||'/'||b.provider_slug,', ') INTO bad
  FROM profile_sponsor_campaigns s JOIN affiliate_campaigns ac ON ac.id=s.affiliate_campaign_id
  JOIN affiliate_links al ON al.id=ac.affiliate_link_id JOIN bookmakers b ON b.id=al.bookmaker_id
  WHERE s.delivery_type='ENTAIN_IFRAME' AND b.provider_slug<>'bwin';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'ENTAIN_DELIVERY_RESTRICTED_TO_BWIN: %',bad; END IF;
END $$;

COMMIT;
