BEGIN;

-- Gives 1xBet the match_inline sponsor slot, which no other campaign holds.
--
-- resolveOffer() fails closed when two campaigns match one placement, so 1xBet deliberately takes a
-- free slot instead of a right rail. Betsson owns every right rail (match/home/team/player) and its
-- placement_allowlist is not touched here: sharing any of those would blank both banners.
UPDATE affiliate_campaigns SET
  placement_allowlist=placement_allowlist||ARRAY['match_inline']::text[],updated_at=now()
WHERE affiliate_link_id=(
    SELECT al.id FROM affiliate_links al
    JOIN bookmakers b ON b.id=al.bookmaker_id
    JOIN countries c ON c.id=al.country_id
    WHERE b.provider_slug='1xbet' AND c.iso2='BR')
  AND NOT ('match_inline'=ANY(placement_allowlist));

-- Official static 970x90 leaderboard from the authenticated Partners media library, stored locally
-- under /sponsors/ so the existing IMAGE delivery path serves it: no new CSP origin, no script
-- embed, no contact with the Betsson Bannerflow path. The animated library creatives were rejected
-- as unusable (180 frames, 4-7MB each).
--
-- 970x90 suits the slot: the match main column is roughly 876px wide (minmax(0,1fr) 300px + 24px
-- gap), so the asset renders at a slight downscale rather than being upscaled. match_inline is
-- desktop-only; mobile hides it and shows mobile_inline instead.
INSERT INTO profile_sponsor_campaigns(id,affiliate_campaign_id,enabled,locale,placement,label,
  image_url,image_alt,approved_at,approval_reference,creative_width,creative_height,
  starts_at,ends_at,delivery_type,embed_source_url)
SELECT '1xbet-match-inline-br',ac.id,true,'br','match_inline','Publicidade',
  '/sponsors/1xbet/match-inline-970x90.webp',
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
