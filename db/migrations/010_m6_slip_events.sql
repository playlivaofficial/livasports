BEGIN;
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK(event_name IN
  ('match_open','match_tab_view','odds_module_view','odds_market_view','odds_bookmaker_click','odds_unavailable_view','affiliate_outbound_click','match_share',
   'slip_open','slip_selection_add','slip_selection_replace','slip_selection_remove','slip_clear','slip_state_invalidated'));
ALTER TABLE product_events ALTER COLUMN fixture_id DROP NOT NULL;
ALTER TABLE product_events ALTER COLUMN competition_id DROP NOT NULL;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS outcome text CHECK(outcome IN ('HOME','DRAW','AWAY','OVER','UNDER','YES','NO'));
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS line numeric CHECK(line=2.5);
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_fixture_context_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_fixture_context_check CHECK(
  (fixture_id IS NOT NULL AND competition_id IS NOT NULL) OR
  (event_name IN ('slip_open','slip_clear') AND fixture_id IS NULL AND competition_id IS NULL));
COMMIT;
