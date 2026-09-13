import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {verifiedGeo} from '@/odds/geo';
import {matchPath} from '@/match-center/routes';
import {teamPath,playerPath} from '@/profiles/routes';
import {pageType} from './policy';
import type {Campaign,CommercialContext,PageContext} from './types';

export async function readCampaigns(db:QueryExecutor,locale:'br'|'mx'):Promise<Campaign[]>{
  const {rows}=await db.query(`SELECT ac.*,al.destination_url,al.enabled AS link_enabled,al.approved_at AS link_approved,
    al.campaign_verified,al.bookmaker_id,b.provider_slug,b.affiliate_status,b.enabled AS bookmaker_enabled,
    g.affiliate_enabled,g.odds_enabled,g.comparison_enabled,g.verified_at,g.verification_state,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'placement',s.placement,'locale',s.locale,'imageUrl',s.image_url,
      'imageAlt',s.image_alt,'width',s.creative_width,'height',s.creative_height,'approved',s.approved_at IS NOT NULL,
      'enabled',s.enabled,'startsAt',s.starts_at,'endsAt',s.ends_at,'delivery',s.delivery_type,'embedSourceUrl',s.embed_source_url)) FROM profile_sponsor_campaigns s WHERE s.affiliate_campaign_id=ac.id),'[]') AS creatives
    FROM affiliate_campaigns ac JOIN affiliate_links al ON al.id=ac.affiliate_link_id
    JOIN bookmakers b ON b.id=al.bookmaker_id JOIN countries c ON c.id=al.country_id
    JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id AND g.country_id=c.id
    WHERE c.iso2=$1 AND b.provider_slug IN ('betsson','betano.bet.br') ORDER BY ac.id LIMIT 65`,[locale.toUpperCase()]);
  if(rows.length>64)throw Error('CAMPAIGN_LIMIT');
  return rows.map(r=>({id:r.id,operatorCampaignId:r.operator_campaign_id,linkId:r.affiliate_link_id,bookmaker:r.provider_slug,locale,
    enabled:r.enabled&&r.link_enabled&&r.bookmaker_enabled,approved:!!r.approved_at&&!!r.link_approved&&r.campaign_verified,
    affiliateApproved:r.affiliate_status==='ACTIVE'&&r.affiliate_enabled,
    geoEligible:!!r.verified_at&&r.odds_enabled&&r.comparison_enabled&&verifiedGeo(r.verification_state,locale)&&(r.provider_slug!=='betano.bet.br'||locale==='br'),
    destination:r.destination_url,destinationType:r.destination_type,placements:r.placement_allowlist,domains:r.operator_domain_allowlist,
    startsAt:new Date(r.valid_from).toISOString(),endsAt:new Date(r.valid_until).toISOString(),creatives:r.creatives}));
}
export async function readPageContext(db:QueryExecutor,context:CommercialContext):Promise<PageContext|null>{
  const type=pageType(context.pagePath);if(!type)return null;
  if(context.placement==='competition_inline'){
    const r=(await db.query('SELECT id FROM competitions WHERE slug=$1 AND enabled LIMIT 1',[context.competitionSlug])).rows[0];
    return r?{pageType:'COMPETITION',pagePath:context.pagePath,competitionId:r.id}:null;
  }
  if(type==='HOME')return {pageType:type,pagePath:context.pagePath};
  const publicId=context.pagePath.slice(-16),locale=context.locale;
  if(type==='MATCH'){
    const r=(await db.query(`SELECT f.id,f.public_id,f.competition_id,h.name AS home,a.name AS away FROM fixtures f
      JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id JOIN competitions c ON c.id=f.competition_id WHERE f.public_id=$1 AND c.enabled LIMIT 1`,[publicId])).rows[0];
    return r&&matchPath(locale,r.public_id,r.home,r.away)===context.pagePath?{pageType:type,pagePath:context.pagePath,fixtureId:r.id,competitionId:r.competition_id}:null;
  }
  if(type==='TEAM'||type==='PLAYER'){
    const r=(await db.query(`SELECT id,public_id,${type==='TEAM'?'name':'display_name AS name'} FROM ${type==='TEAM'?'teams':'players'} WHERE public_id=$1 LIMIT 1`,[publicId])).rows[0];
    const path=type==='TEAM'?teamPath:playerPath;
    return r&&path(locale,r.public_id,r.name)===context.pagePath?{pageType:type,pagePath:context.pagePath,...(type==='TEAM'?{teamId:r.id}:{playerId:r.id})}:null;
  }
  // No standalone competition pages exist yet. Never attribute an invented path.
  return null;
}
export function marketSummary(context:CommercialContext){const result={MATCH_WINNER:0,TOTAL_GOALS:0,BTTS:0};for(const s of context.selections??[])result[s.market]++;if(context.market)result[context.market]++;return result;}
