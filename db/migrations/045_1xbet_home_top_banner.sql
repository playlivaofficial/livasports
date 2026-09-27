BEGIN;

-- Moves the desktop home top banner from Betsson to 1xBet, at the owner's request.
--
-- resolveOffer() fails closed when two campaigns match one placement, so this is an explicit
-- reallocation rather than a shared slot: Betsson loses home_top_banner and 1xBet gains it. The
-- arbitration rule is untouched and no commission-based priority is introduced.
--
-- Betsson keeps every other placement it holds: match_odds_table, match_slip_comparison,
-- slip_bookmaker_comparison, home_right_rail, match_right_rail, team_right_rail,
-- player_right_rail, mobile_inline and profile_mobile_inline.
UPDATE affiliate_campaigns SET placement_allowlist=array_remove(placement_allowlist,'home_top_banner'),updated_at=now()
WHERE affiliate_link_id=(SELECT al.id FROM affiliate_links al JOIN bookmakers b ON b.id=al.bookmaker_id
    JOIN countries c ON c.id=al.country_id WHERE b.provider_slug='betsson' AND c.iso2='BR')
  AND 'home_top_banner'=ANY(placement_allowlist)
  AND EXISTS(SELECT 1 FROM affiliate_campaigns ac JOIN affiliate_links al ON al.id=ac.affiliate_link_id
    JOIN bookmakers b ON b.id=al.bookmaker_id JOIN countries c ON c.id=al.country_id
    WHERE b.provider_slug='1xbet' AND c.iso2='BR' AND ac.enabled AND ac.approved_at IS NOT NULL);

-- The Betsson creative row is disabled, not deleted, so its historical impressions and clicks keep
-- resolving. Re-enabling it would require putting the placement back on the Betsson campaign too.
UPDATE profile_sponsor_campaigns SET enabled=false,updated_at=now() WHERE id='betsson-br-home-top-banner'
  AND EXISTS(SELECT 1 FROM affiliate_campaigns ac JOIN affiliate_links al ON al.id=ac.affiliate_link_id
    JOIN bookmakers b ON b.id=al.bookmaker_id JOIN countries c ON c.id=al.country_id
    WHERE b.provider_slug='1xbet' AND c.iso2='BR' AND ac.enabled AND ac.approved_at IS NOT NULL);

UPDATE affiliate_campaigns SET placement_allowlist=placement_allowlist||ARRAY['home_top_banner']::text[],updated_at=now()
WHERE affiliate_link_id=(SELECT al.id FROM affiliate_links al JOIN bookmakers b ON b.id=al.bookmaker_id
    JOIN countries c ON c.id=al.country_id WHERE b.provider_slug='1xbet' AND c.iso2='BR')
  AND NOT ('home_top_banner'=ANY(placement_allowlist));

-- Same official static 970x90 PT-BR leaderboard used for match_inline, served locally through the
-- existing IMAGE delivery path. It carries the required Brazilian regulatory text. Its own file so
-- either slot can be re-pointed without touching the other.
INSERT INTO profile_sponsor_campaigns(id,affiliate_campaign_id,enabled,locale,placement,label,
  image_url,image_alt,approved_at,approval_reference,creative_width,creative_height,
  starts_at,ends_at,delivery_type,embed_source_url)
SELECT '1xbet-home-top-banner-br',ac.id,true,'br','home_top_banner','Publicidade',
  '/sponsors/1xbet/top-banner-970x90.webp',
  '1xBet: apostas esportivas. Proibido para menores de 18 anos. Jogue com responsabilidade.',
  now(),
  'Owner-approved 1xBet static 970x90 creative; private approval evidence held in production configuration',
  970,90,ac.valid_from,ac.valid_until,'IMAGE',NULL
FROM affiliate_campaigns ac
JOIN affiliate_links al ON al.id=ac.affiliate_link_id
JOIN bookmakers b ON b.id=al.bookmaker_id
JOIN countries c ON c.id=al.country_id
WHERE b.provider_slug='1xbet' AND c.iso2='BR'
ON CONFLICT(id) DO UPDATE SET enabled=true,image_url=excluded.image_url,image_alt=excluded.image_alt,
  approved_at=now(),creative_width=excluded.creative_width,creative_height=excluded.creative_height,
  starts_at=excluded.starts_at,ends_at=excluded.ends_at,delivery_type='IMAGE',embed_source_url=NULL,
  updated_at=now();

COMMIT;
