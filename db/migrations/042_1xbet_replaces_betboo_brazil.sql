BEGIN;

-- Brazil's third public card moves from Betboo to 1xBet.
--
-- OddsPapi publishes exactly one 1xBet feed (slug '1xbet', cloneOf null) with no .bet.br clone, and
-- it reports the generic 1xbet.com host on every fixture. Owner-approved for BR on the same basis as
-- the generic Betsson feed. No affiliate approval or destination is inferred here.
INSERT INTO bookmakers(provider_slug,display_name,enabled,comparison_enabled,affiliate_status,logo_ref)
VALUES ('1xbet','1xBet',true,true,'NOT_APPLIED',NULL)
ON CONFLICT(provider_slug) DO UPDATE SET enabled=true,comparison_enabled=true,updated_at=now();

INSERT INTO bookmaker_geo_availability(bookmaker_id,country_id,odds_enabled,comparison_enabled,affiliate_enabled,verified_at,verification_state)
SELECT b.id,c.id,true,true,false,now(),'VERIFIED_BR'
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug='1xbet' AND c.iso2='BR'
ON CONFLICT(bookmaker_id,country_id) DO UPDATE SET odds_enabled=true,comparison_enabled=true,updated_at=now();

-- Betboo is retired, not deleted: its rows stay so stored odds, analytics events and audit exports
-- keep resolving. It is only switched off, which removes it from every public and comparable surface.
-- OddsPapi also dropped it from our subscription, so it can no longer be priced at all.
UPDATE bookmakers SET enabled=false,comparison_enabled=false,updated_at=now() WHERE provider_slug='betboo.bet.br';
UPDATE bookmaker_geo_availability SET odds_enabled=false,comparison_enabled=false,affiliate_enabled=false,updated_at=now()
WHERE bookmaker_id=(SELECT id FROM bookmakers WHERE provider_slug='betboo.bet.br');

-- Betboo stays inside both CHECK constraints: historical refresh targets and analytics events still
-- carry it, so removing it would reject existing rows.
ALTER TABLE odds_refresh_targets DROP CONSTRAINT IF EXISTS odds_refresh_targets_bookmaker_check;
ALTER TABLE odds_refresh_targets ADD CONSTRAINT odds_refresh_targets_bookmaker_check
CHECK(bookmaker IN ('betano.bet.br','betsson','sportingbet.bet.br','betboo.bet.br','1xbet'));
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_bookmaker_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_bookmaker_check
CHECK(bookmaker IN ('betano.bet.br','betsson','sportingbet.bet.br','betboo.bet.br','1xbet'));

-- Stop future provider demand for the retired feed. Past rows are left untouched.
DELETE FROM odds_refresh_targets WHERE bookmaker='betboo.bet.br';

COMMIT;
