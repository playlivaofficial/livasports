BEGIN;
-- Reuse the existing secure destination and click tables. No destination,
-- campaign, creative, commercial credential, or conversion is seeded.
CREATE TABLE affiliate_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id uuid NOT NULL REFERENCES affiliate_links(id),
  operator_campaign_id text NOT NULL CHECK(length(operator_campaign_id) BETWEEN 1 AND 160),
  destination_type text NOT NULL CHECK(destination_type IN ('HOMEPAGE','SPORTSBOOK')),
  enabled boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approval_reference text NOT NULL CHECK(length(approval_reference) BETWEEN 1 AND 500),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL CHECK(valid_until>valid_from),
  placement_allowlist text[] NOT NULL CHECK(cardinality(placement_allowlist) BETWEEN 1 AND 17 AND placement_allowlist <@ ARRAY['match_odds_table','match_slip_comparison','match_right_rail','match_top_banner','match_inline','team_top_leaderboard','team_right_rail','team_inline','player_top_leaderboard','player_right_rail','player_inline','slip_bookmaker_comparison','home_top_banner','home_right_rail','competition_inline','mobile_inline','profile_mobile_inline']::text[]),
  operator_domain_allowlist text[] NOT NULL CHECK(cardinality(operator_domain_allowlist) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(affiliate_link_id,operator_campaign_id)
);
CREATE INDEX affiliate_campaign_eligibility_idx ON affiliate_campaigns(affiliate_link_id,enabled,valid_from,valid_until);
ALTER TABLE affiliate_clicks ADD COLUMN campaign_id uuid REFERENCES affiliate_campaigns(id);
ALTER TABLE affiliate_clicks ADD COLUMN bookmaker_id uuid REFERENCES bookmakers(id);
ALTER TABLE affiliate_clicks ADD COLUMN locale text CHECK(locale IN ('br','mx'));
ALTER TABLE affiliate_clicks ADD COLUMN geo text CHECK(geo IN ('BR','MX'));
ALTER TABLE affiliate_clicks ADD COLUMN placement_id text;
ALTER TABLE affiliate_clicks ADD COLUMN page_type text CHECK(page_type IN ('HOME','MATCH','TEAM','PLAYER','COMPETITION'));
ALTER TABLE affiliate_clicks ADD COLUMN page_path text CHECK(length(page_path)<=240);
ALTER TABLE affiliate_clicks ADD COLUMN team_id uuid REFERENCES teams(id);
ALTER TABLE affiliate_clicks ADD COLUMN player_id uuid REFERENCES players(id);
ALTER TABLE affiliate_clicks ADD COLUMN competition_id uuid REFERENCES competitions(id);
ALTER TABLE affiliate_clicks ADD COLUMN selection_count integer CHECK(selection_count BETWEEN 0 AND 10);
ALTER TABLE affiliate_clicks ADD COLUMN markets_summary jsonb;
ALTER TABLE affiliate_clicks ADD COLUMN destination_type text CHECK(destination_type IN ('HOMEPAGE','SPORTSBOOK'));
ALTER TABLE affiliate_clicks ADD COLUMN redirect_status text CHECK(redirect_status='ISSUED_303');
ALTER TABLE affiliate_clicks ADD COLUMN traffic_class text CHECK(traffic_class IN ('HUMAN_CLICK','QA_TEST','UNKNOWN'));
ALTER TABLE affiliate_clicks ADD COLUMN dedup_key text UNIQUE;
ALTER TABLE affiliate_clicks ADD CONSTRAINT affiliate_click_m8_privacy CHECK(campaign_id IS NULL OR (referrer IS NULL AND user_agent IS NULL AND ip_hash IS NULL AND metadata='{}'::jsonb));
CREATE INDEX affiliate_click_campaign_time_idx ON affiliate_clicks(campaign_id,clicked_at DESC);
CREATE TABLE affiliate_impressions (
  id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES affiliate_campaigns(id),
  bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),placement_id text NOT NULL,
  locale text NOT NULL CHECK(locale IN ('br','mx')),geo text NOT NULL CHECK(geo IN ('BR','MX')),
  page_type text NOT NULL CHECK(page_type IN ('HOME','MATCH','TEAM','PLAYER','COMPETITION')),page_path text NOT NULL CHECK(length(page_path)<=240),
  fixture_id uuid REFERENCES fixtures(id),team_id uuid REFERENCES teams(id),player_id uuid REFERENCES players(id),competition_id uuid REFERENCES competitions(id),
  selection_count integer NOT NULL CHECK(selection_count BETWEEN 0 AND 10),markets_summary jsonb NOT NULL,
  traffic_class text NOT NULL CHECK(traffic_class IN ('HUMAN_VIEW','QA_TEST','UNKNOWN')),occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_impression_campaign_time_idx ON affiliate_impressions(campaign_id,occurred_at DESC);
-- Existing profile campaign table now supplies approved creatives for every
-- allowlisted placement; legacy destination fields are never a routing source.
ALTER TABLE profile_sponsor_campaigns ADD COLUMN affiliate_campaign_id uuid REFERENCES affiliate_campaigns(id);
ALTER TABLE profile_sponsor_campaigns ADD COLUMN approved_at timestamptz;
ALTER TABLE profile_sponsor_campaigns ADD COLUMN approval_reference text;
ALTER TABLE profile_sponsor_campaigns ADD COLUMN creative_width integer CHECK(creative_width BETWEEN 100 AND 2400);
ALTER TABLE profile_sponsor_campaigns ADD COLUMN creative_height integer CHECK(creative_height BETWEEN 40 AND 1600);
ALTER TABLE profile_sponsor_campaigns ALTER COLUMN destination_url DROP NOT NULL;
ALTER TABLE profile_sponsor_campaigns DROP CONSTRAINT profile_sponsor_campaigns_placement_check;
ALTER TABLE profile_sponsor_campaigns ADD CONSTRAINT profile_sponsor_campaigns_placement_check CHECK(placement IN ('match_right_rail','match_top_banner','match_inline','team_top_leaderboard','team_right_rail','team_inline','player_top_leaderboard','player_right_rail','player_inline','home_top_banner','home_right_rail','competition_inline','mobile_inline','profile_mobile_inline'));
CREATE TABLE affiliate_operational_state (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),last_redirect_error_at timestamptz,last_redirect_error text,
  last_maintenance_at timestamptz,postback_operational boolean NOT NULL DEFAULT false CHECK(NOT postback_operational)
);
INSERT INTO affiliate_operational_state(id) VALUES(true);
-- Real operator evidence only. There is deliberately no public ingest receiver.
CREATE TABLE affiliate_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bookmaker_id uuid NOT NULL REFERENCES bookmakers(id),
  click_id uuid REFERENCES affiliate_clicks(id) ON DELETE SET NULL,
  operator_event_id text NOT NULL,event_type text NOT NULL CHECK(event_type IN ('REGISTRATION','FTD','QUALIFIED_FTD','REVENUE_EVENT')),
  occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
  source_reference text NOT NULL,verification_reference text NOT NULL,
  currency char(3),reported_revenue numeric,reported_commission numeric,
  UNIQUE(bookmaker_id,operator_event_id)
);
COMMIT;
