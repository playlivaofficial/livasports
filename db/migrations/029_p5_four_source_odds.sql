BEGIN;

-- Add only verified BR feed identities. No affiliate approval or destination is inferred.
INSERT INTO bookmakers(provider_slug,display_name,enabled,comparison_enabled,affiliate_status,logo_ref)
VALUES ('sportingbet.bet.br','Sportingbet BR',true,true,'NOT_APPLIED','/bookmakers/sportingbet.webp'),
       ('betboo.bet.br','betboo BR',true,true,'NOT_APPLIED','/bookmakers/betboo.webp')
ON CONFLICT(provider_slug) DO NOTHING;

INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,odds_enabled,comparison_enabled,affiliate_enabled,verified_at,verification_state)
SELECT b.id,c.id,true,true,false,now(),'VERIFIED_BR'
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug IN ('sportingbet.bet.br','betboo.bet.br') AND c.iso2='BR'
ON CONFLICT(bookmaker_id,country_id) DO NOTHING;

ALTER TABLE odds_refresh_targets DROP CONSTRAINT IF EXISTS odds_refresh_targets_bookmaker_check;
ALTER TABLE odds_refresh_targets ADD CONSTRAINT odds_refresh_targets_bookmaker_check
CHECK(bookmaker IN ('betano.bet.br','betsson','sportingbet.bet.br','betboo.bet.br'));
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_bookmaker_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_bookmaker_check
CHECK(bookmaker IN ('betano.bet.br','betsson','sportingbet.bet.br','betboo.bet.br'));

COMMIT;
