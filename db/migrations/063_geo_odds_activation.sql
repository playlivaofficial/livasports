BEGIN;

-- MX/CO/PE pregame odds activation. Commercial promotion is deliberately NOT enabled here:
-- every row stays commercial_status='CANDIDATE' with affiliate_enabled=false, so odds and slip
-- comparison go live while banners, CTAs and tracking links remain fail-closed until real
-- affiliate campaign data is collected from the operator panels.

-- Betsson Mexico legal evidence. Owner-confirmed on 2026-10-05: the SEGOB regulator portal
-- (juegosysorteos.gob.mx) is HTTP-only and was not machine-readable from the build environment, and
-- betsson.mx geo-redirects outside Mexico, so this is recorded as owner-confirmed rather than as a
-- fetched regulator URL. Evidence: DGJS website authorization DGJS/DCRCA/0688/2021 for betsson.mx,
-- operated by Comercial de Juegos de la Frontera, S.A. de C.V. under SEGOB permit DGG/723/97, with
-- additional operator authorization DGJS/1476/2015, as stated in Betsson Mexico's Terms and Rules.
UPDATE bookmaker_geo_availability g SET legal_status='VERIFIED',legal_verified_at='2026-10-05T00:00:00Z',
 legal_reference='SEGOB/DGJS owner-confirmed 2026-10-05 · betsson.mx authorized by oficio DGJS/DCRCA/0688/2021 · permisionario Comercial de Juegos de la Frontera, S.A. de C.V. · permiso DGG/723/97 · operadora authorization DGJS/1476/2015 · source: Betsson Mexico Terms and Rules + SEGOB DGJS permit listing',
 destination_domains=CASE WHEN cardinality(g.destination_domains)=0 THEN ARRAY['betsson.mx','www.betsson.mx'] ELSE g.destination_domains END,
 currency=COALESCE(g.currency,'MXN'),updated_at=now()
 FROM bookmakers b,countries c
 WHERE b.id=g.bookmaker_id AND c.id=g.country_id AND b.provider_slug='betsson' AND c.iso2='MX'
   AND g.legal_status<>'VERIFIED';

-- Real source domains exactly as OddsPapi reported them on 2026-10-05. These are country-neutral
-- hosts and are NOT jurisdiction evidence on their own -- legal_reference above carries that. The
-- generic Betsson feed serves both Mexico and Colombia; OddsPapi publishes no .mx/.co/.pe clone.
UPDATE bookmaker_geo_availability g
SET source_domains=v.domains,verification_state='VERIFIED_'||c.iso2,verified_at=COALESCE(g.verified_at,now()),
    sportsbook_enabled=true,odds_enabled=true,comparison_enabled=true,
    last_validated_at=now(),updated_at=now()
FROM bookmakers b,countries c,(VALUES
 ('MX','betsson',ARRAY['www.betsson.com']),
 ('CO','betsson',ARRAY['www.betsson.com']),
 ('CO','bwin',ARRAY['sports.bwin.com']),
 ('PE','inkabet',ARRAY['www.betsson.com'])
) AS v(geo,operator,domains)
WHERE b.id=g.bookmaker_id AND c.id=g.country_id AND c.iso2=v.geo AND b.provider_slug=v.operator;

-- bwin and Inkabet are now real comparable books rather than unmapped candidates.
UPDATE bookmakers SET comparison_enabled=true,updated_at=now()
 WHERE provider_slug IN ('bwin','inkabet') AND NOT comparison_enabled;

-- Verified OddsPapi provider mappings. Identifiers were read from the live catalog and confirmed by
-- real pregame responses, NOT inferred from display names. Betsson maps in both MX and CO off the
-- one generic feed; the UNIQUE(country_id,provider,provider_bookmaker_id) key keeps those distinct.
INSERT INTO operator_provider_mappings(bookmaker_id,country_id,provider,provider_bookmaker_id,verified_at,evidence)
SELECT b.id,c.id,'ODDSPAPI',v.provider_id,'2026-10-05T11:05:00Z',v.evidence::jsonb
FROM bookmakers b,countries c,(VALUES
 ('MX','betsson','betsson','{"verifiedOn":"2026-10-05","catalogName":"Betsson","cloneOf":null,"sourceDomainObserved":"www.betsson.com","hasLiveOdds":false,"hasPlayerProps":false,"subscriptionWindow":"2026-10-02T11:10:51Z/2026-11-02T11:10:51Z","sportIds":[10],"tournamentObserved":27464,"tournamentName":"Liga MX","fixturesWithOdds":8,"marketsObserved":["101","104","1010"],"allActive":true,"anySuspended":false}'),
 ('CO','betsson','betsson','{"verifiedOn":"2026-10-05","catalogName":"Betsson","cloneOf":null,"sourceDomainObserved":"www.betsson.com","hasLiveOdds":false,"hasPlayerProps":false,"subscriptionWindow":"2026-10-02T11:10:51Z/2026-11-02T11:10:51Z","sportIds":[10],"tournamentObserved":27070,"tournamentName":"Liga DIMAYOR","fixturesWithOdds":6,"marketsObserved":["101","104","1010"],"allActive":true,"anySuspended":false}'),
 ('CO','bwin','bwin','{"verifiedOn":"2026-10-05","catalogName":"Bwin","cloneOf":null,"sourceDomainObserved":"sports.bwin.com","hasLiveOdds":false,"hasPlayerProps":false,"subscriptionWindow":"2026-10-02T11:10:51Z/2026-11-02T11:10:51Z","sportIds":[10],"tournamentObserved":27070,"tournamentName":"Liga DIMAYOR","fixturesWithOdds":5,"marketsObserved":["101","104","1010"],"allActive":true,"anySuspended":false,"independentOfBetsson":true,"note":"prices differ from Betsson on shared fixtures, so CO is a genuine comparison"}'),
 ('PE','inkabet','inkabet','{"verifiedOn":"2026-10-05","catalogName":"Inkabet","cloneOf":"betsson","sourceDomainObserved":"www.betsson.com","hasLiveOdds":false,"hasPlayerProps":false,"subscriptionWindow":"2026-10-02T11:10:51Z/2026-11-02T11:10:51Z","sportIds":[10],"tournamentObserved":406,"tournamentName":"Liga 1","fixturesWithOdds":8,"marketsObserved":["101","104","1010"],"allActive":true,"anySuspended":false,"priceMirrorOfBetsson":true,"note":"1/X/2 identical to Betsson on all 8 observed fixtures; must never be compared against Betsson in one GEO"}')
) AS v(geo,operator,provider_id,evidence)
WHERE b.provider_slug=v.operator AND c.iso2=v.geo
ON CONFLICT(bookmaker_id,country_id,provider,provider_bookmaker_id)
 DO UPDATE SET verified_at=excluded.verified_at,evidence=excluded.evidence;

-- Fail loudly rather than serving odds for an operator with no jurisdiction evidence.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO missing
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE (c.iso2,b.provider_slug) IN (('MX','betsson'),('CO','betsson'),('CO','bwin'),('PE','inkabet'))
    AND (g.legal_status<>'VERIFIED' OR g.legal_verified_at IS NULL OR NULLIF(trim(g.legal_reference),'') IS NULL
         OR NOT g.odds_enabled OR NOT g.comparison_enabled OR NOT g.sportsbook_enabled
         OR cardinality(g.source_domains)=0 OR g.verified_at IS NULL);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'ODDS_ACTIVATION_INCOMPLETE: %',missing; END IF;

  SELECT string_agg(c.iso2||'/'||b.provider_slug,', ') INTO missing
  FROM bookmaker_geo_availability g JOIN bookmakers b ON b.id=g.bookmaker_id JOIN countries c ON c.id=g.country_id
  WHERE (c.iso2,b.provider_slug) IN (('MX','betsson'),('CO','betsson'),('CO','bwin'),('PE','inkabet'))
    AND (g.affiliate_enabled OR g.commercial_status<>'CANDIDATE');
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'COMMERCIAL_MUST_STAY_FAIL_CLOSED: %',missing; END IF;
END $$;

COMMIT;
