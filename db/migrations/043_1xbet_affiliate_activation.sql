BEGIN;

-- Activates the 1xBet affiliate CTA for Brazil using values read from the authenticated 1xBet
-- Partners dashboard (Aff ID 4841984, site http://www.livasports.com, campaign "DirectLink USD",
-- generated link 7035424). Nothing here is inferred: the destination is the exact generated link,
-- and 1xaff.com.br is the tracking host those links actually resolve to, which is also the only
-- host the affiliate allowlist in src/odds/affiliate.ts accepts for '1xbet:br'.
--
-- The link carries no landing path, so it lands on the operator homepage: destination_type HOMEPAGE.
INSERT INTO affiliate_links(bookmaker_id,country_id,destination_url,enabled,approved_at,campaign_verified,approved_placement)
SELECT b.id,c.id,'https://1xaff.com.br/L?tag=d_6128686m_134462c_&site=6128686&ad=134462',true,now(),true,'match-odds'
FROM bookmakers b CROSS JOIN countries c
WHERE b.provider_slug='1xbet' AND c.iso2='BR'
ON CONFLICT(bookmaker_id,country_id) DO UPDATE SET
  destination_url=excluded.destination_url,enabled=true,approved_at=now(),campaign_verified=true,
  approved_placement='match-odds',updated_at=now();

-- Placements are limited to the surfaces that actually render a bookmaker CTA today. No banner
-- placement is claimed: 1xBet has no right-rail creative wired, and inventing one would let the
-- commercial layer authorise a slot the product cannot serve.
INSERT INTO affiliate_campaigns(affiliate_link_id,operator_campaign_id,destination_type,enabled,approved_at,
  approval_reference,valid_from,valid_until,placement_allowlist,operator_domain_allowlist)
SELECT al.id,'7035424','HOMEPAGE',true,now(),
  '1xBet Partners Aff ID 4841984 / campaign DirectLink USD / generated link 7035424 / site 6128686 / ad 134462',
  now(),now()+interval '1 year',
  ARRAY['match_odds_table','match_slip_comparison','slip_bookmaker_comparison']::text[],
  ARRAY['1xaff.com.br']::text[]
FROM affiliate_links al JOIN bookmakers b ON b.id=al.bookmaker_id JOIN countries c ON c.id=al.country_id
WHERE b.provider_slug='1xbet' AND c.iso2='BR'
ON CONFLICT(affiliate_link_id,operator_campaign_id) DO UPDATE SET
  enabled=true,approved_at=now(),valid_until=now()+interval '1 year',updated_at=now();

-- readCampaigns() gates affiliateApproved on BOTH of these, so the CTA stays dark without them.
UPDATE bookmakers SET affiliate_status='ACTIVE',updated_at=now() WHERE provider_slug='1xbet';
UPDATE bookmaker_geo_availability SET affiliate_enabled=true,updated_at=now()
WHERE bookmaker_id=(SELECT id FROM bookmakers WHERE provider_slug='1xbet')
  AND country_id=(SELECT id FROM countries WHERE iso2='BR');

COMMIT;
