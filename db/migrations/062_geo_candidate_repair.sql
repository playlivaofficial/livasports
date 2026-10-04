BEGIN;

-- 057 can meet pre-existing M5 rows for the same operator/country. Repair only
-- untouched candidate defaults; do not replace owner configuration or evidence.
UPDATE bookmaker_geo_availability g
SET currency=COALESCE(g.currency,v.currency),
    public_priority=CASE WHEN g.public_priority=100 THEN v.priority ELSE g.public_priority END,
    updated_at=now()
FROM bookmakers b,countries c,(VALUES
 ('MX','betsson','MXN',10),('MX','codere','MXN',20),('MX','caliente','MXN',30),('MX','10bet','MXN',40),
 ('CO','betsson','COP',10),('CO','bwin','COP',20),('CO','betano','COP',30),('CO','codere','COP',40),('CO','betplay','COP',50),
 ('PE','betsson','PEN',10),('PE','betano','PEN',20),('PE','inkabet','PEN',30),('PE','betsafe','PEN',40),('PE','bet365','PEN',50)
) AS v(geo,operator,currency,priority)
WHERE b.id=g.bookmaker_id AND c.id=g.country_id AND b.provider_slug=v.operator AND c.iso2=v.geo
  AND g.commercial_version=0 AND g.commercial_status IN ('CANDIDATE','PENDING')
  AND (g.currency IS NULL OR g.public_priority=100);

-- M5 once created a disabled Betano BR row for Mexico. It is historical feed
-- identity, not the approved generic Betano CO/PE candidate or a fifth MX book.
-- Keep the row, provider evidence, pricing flags and all quote/campaign history.
UPDATE bookmaker_geo_availability g
SET commercial_status='UNAVAILABLE',affiliate_enabled=false,updated_at=now()
FROM bookmakers b,countries c
WHERE b.id=g.bookmaker_id AND c.id=g.country_id
  AND b.provider_slug='betano.bet.br' AND c.iso2='MX'
  AND g.commercial_version=0 AND g.commercial_status IN ('CANDIDATE','PENDING');

COMMIT;
