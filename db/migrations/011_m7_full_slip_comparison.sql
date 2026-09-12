BEGIN;
-- Owner-confirmed commercial evidence, 2026-09-12. Feed naming is not a BR denial.
-- Preserve MX and every affiliate destination. No new link/campaign is invented.
UPDATE bookmaker_geo_availability g SET odds_enabled=true,comparison_enabled=true,
  verification_state=CASE WHEN g.verification_state='VERIFIED_BR_MX' THEN g.verification_state ELSE 'VERIFIED_BR' END,
  affiliate_enabled=(b.affiliate_status='ACTIVE'),verified_at=now(),
  evidence=g.evidence || '{"m7":"Owner confirmed Betsson BR odds eligibility and affiliate approval; generic betsson.com feed accepted; destination remains independently gated","confirmedAt":"2026-09-12"}'::jsonb
FROM bookmakers b,countries c WHERE b.id=g.bookmaker_id AND c.id=g.country_id AND b.provider_slug='betsson' AND c.iso2='BR';

ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK(event_name IN
  ('match_open','match_tab_view','odds_module_view','odds_market_view','odds_bookmaker_click','odds_unavailable_view','affiliate_outbound_click','match_share',
   'slip_open','slip_selection_add','slip_selection_replace','slip_selection_remove','slip_clear','slip_state_invalidated',
   'slip_comparison_view','slip_bookmaker_complete','slip_bookmaker_partial','slip_best_price_view','slip_bookmaker_click'));
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_fixture_context_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_fixture_context_check CHECK(
  (fixture_id IS NOT NULL AND competition_id IS NOT NULL) OR
  (event_name IN ('slip_open','slip_clear','slip_comparison_view','slip_bookmaker_complete','slip_bookmaker_partial','slip_best_price_view','slip_bookmaker_click') AND fixture_id IS NULL AND competition_id IS NULL));
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS selection_count integer CHECK(selection_count BETWEEN 0 AND 10);
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS available_count integer CHECK(available_count BETWEEN 0 AND 10);
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS complete boolean;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS markets_summary jsonb;
COMMIT;
