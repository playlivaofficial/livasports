BEGIN;

-- Peru gains 1xBet as a second real odds source. Commercial state stays fail-closed here:
-- affiliate_enabled=false and commercial_status='CANDIDATE', exactly as 063 left MX/CO/PE. The
-- Peru banner activation runs separately through the owner commercial path.
--
-- Entitlement verified against the live OddsPapi account on 2026-10-06: the active subscription
-- lists betsson, bwin, inkabet and 1xbet, every one with has_live_odds=false and
-- has_player_props=false, sport_ids [10], window 2026-10-02 -> 2026-11-02. Peru Liga 1 (tournament
-- 406) returned 9 of 9 fixtures priced with markets 101 (MATCH_WINNER), 104 (BTTS) and 1010
-- (TOTAL_GOALS 2.5).
--
-- Legal status is recorded as owner-confirmed rather than as a fetched regulator record, the same
-- way 063 recorded Betsson Mexico. No licence identifier is asserted here because none was machine
-- verified; the owner approved 1xBet as the Peru commercial and pricing brand on 2026-10-06.
INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,odds_enabled,comparison_enabled,sportsbook_enabled,
  affiliate_enabled,commercial_status,legal_status,legal_verified_at,legal_reference,verification_state,verified_at,
  source_domains,currency,last_validated_at)
SELECT b.id,c.id,true,true,true,
  false,'CANDIDATE','VERIFIED','2026-10-06T00:00:00Z',
  'Owner-confirmed 2026-10-06: 1xBet approved as the Peru pricing and commercial brand. OddsPapi publishes a single generic 1xBet feed (slug 1xbet, cloneOf null) with no .pe clone, so Peru prices off that feed — the same shape already accepted for the generic Betsson feed in MX/CO. Entitlement and Liga 1 coverage verified against the live account the same day.',
  'VERIFIED_PE',now(),
  ARRAY['1xbet.com'],'PEN',now()
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug='1xbet' AND c.iso2='PE'
ON CONFLICT(bookmaker_id,country_id) DO UPDATE SET
  odds_enabled=true,comparison_enabled=true,sportsbook_enabled=true,
  legal_status='VERIFIED',legal_verified_at=excluded.legal_verified_at,legal_reference=excluded.legal_reference,
  verification_state='VERIFIED_PE',verified_at=COALESCE(bookmaker_geo_availability.verified_at,now()),
  source_domains=excluded.source_domains,currency=COALESCE(bookmaker_geo_availability.currency,'PEN'),
  last_validated_at=now(),updated_at=now();

-- Verified OddsPapi mapping. The identifier is the one the live catalog returns, not a guess.
INSERT INTO operator_provider_mappings(bookmaker_id,country_id,provider,provider_bookmaker_id,verified_at,evidence)
SELECT b.id,c.id,'ODDSPAPI','1xbet','2026-10-06T16:00:00Z','{"verifiedOn":"2026-10-06","catalogName":"1xBet","cloneOf":null,"sourceDomainObserved":"1xbet.com","hasLiveOdds":false,"hasPlayerProps":false,"subscriptionWindow":"2026-10-02T11:10:51Z/2026-11-02T11:10:51Z","sportIds":[10],"tournamentObserved":406,"tournamentName":"Liga 1","fixturesWithOdds":9,"fixturesReturned":9,"marketsObserved":["101","104","1010"],"bookmakerIsActiveTrue":0,"pricesActive":"27/27","note":"bookmaker-level active flag is unreliable provider metadata while individual prices are listed and active; handled by the VERIFIED_LISTED_MARKET policy, which does not relax freshness"}'::jsonb
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug='1xbet' AND c.iso2='PE'
ON CONFLICT(bookmaker_id,country_id,provider,provider_bookmaker_id)
 DO UPDATE SET verified_at=excluded.verified_at,evidence=excluded.evidence;

-- Peru must not inherit Betsson commercially or as a price source, and Brazil must stay retired.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2='PE' AND g.odds_enabled AND b.provider_slug NOT IN ('inkabet','1xbet');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PE_ODDS_POOL_UNEXPECTED: %',bad; END IF;

  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2='PE' AND (g.affiliate_enabled OR g.commercial_status<>'CANDIDATE');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'PE_COMMERCIAL_MUST_STAY_FAIL_CLOSED: %',bad; END IF;

  -- Brazil keeps its legacy 1xBet row for history. It is dark because readVerifiedOperatorFeeds
  -- requires a non-empty source_domains and there is no BR provider mapping, so no BR feed can be
  -- produced. Assert that, and that BR stays commercially off, rather than the flag alone.
  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE c.iso2='BR' AND b.provider_slug='1xbet'
    AND (g.affiliate_enabled OR g.commercial_status<>'SUSPENDED' OR cardinality(g.source_domains)>0);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'BR_1XBET_MUST_STAY_RETIRED: %',bad; END IF;

  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO bad
  FROM operator_provider_mappings m JOIN bookmakers b ON b.id=m.bookmaker_id JOIN countries c ON c.id=m.country_id
  WHERE c.iso2='BR';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'BR_PROVIDER_MAPPING_MUST_NOT_EXIST: %',bad; END IF;
END $$;

COMMIT;
