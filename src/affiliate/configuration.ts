import 'server-only';
import type {DatabaseClient} from '@/database/client';
import {placements,type Campaign,type Placement} from './types';
import {campaignDestination,isSponsorPlacement,validCreative} from './policy';
export interface CampaignConfiguration {
  bookmaker:'betsson'|'betano.bet.br';locale:'br'|'mx';operatorCampaignId:string;destinationUrl:string;destinationType:'HOMEPAGE'|'SPORTSBOOK';
  enabled:boolean;validFrom:string;validUntil:string;placements:Placement[];domains:string[];approvalReference:string;
  creatives?:Array<{id:string;placement:Placement;imageUrl:string;imageAlt:string;width:number;height:number;approvalReference:string}>;
}
export function parseCampaignConfiguration(value:unknown):CampaignConfiguration|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;const c=value as CampaignConfiguration;
  if(Object.keys(c).some(k=>!['bookmaker','locale','operatorCampaignId','destinationUrl','destinationType','enabled','validFrom','validUntil','placements','domains','approvalReference','creatives'].includes(k))||
    !['betsson','betano.bet.br'].includes(c.bookmaker)||!['br','mx'].includes(c.locale)||typeof c.enabled!=='boolean'||
    typeof c.operatorCampaignId!=='string'||!c.operatorCampaignId.trim()||c.operatorCampaignId.length>160||typeof c.approvalReference!=='string'||!c.approvalReference.trim()||c.approvalReference.length>500||
    !Array.isArray(c.placements)||!c.placements.length||c.placements.length>17||new Set(c.placements).size!==c.placements.length||c.placements.some(p=>!placements.includes(p))||
    !Array.isArray(c.domains)||!c.domains.length||c.domains.length>8||c.domains.some(d=>typeof d!=='string'||!d.length)||
    typeof c.validFrom!=='string'||typeof c.validUntil!=='string'||!Number.isFinite(Date.parse(c.validFrom))||!Number.isFinite(Date.parse(c.validUntil))||Date.parse(c.validUntil)<=Date.parse(c.validFrom))return null;
  const campaign={enabled:true,approved:true,affiliateApproved:true,geoEligible:true,locale:c.locale,bookmaker:c.bookmaker,placements:c.placements,domains:c.domains,
    destination:c.destinationUrl,destinationType:c.destinationType,operatorCampaignId:c.operatorCampaignId,startsAt:c.validFrom,endsAt:c.validUntil} as Campaign;
  if(!campaignDestination(campaign,{locale:c.locale,pagePath:'/'+c.locale,placement:c.placements[0]},Date.parse(c.validFrom)))return null;
  if(c.creatives!==undefined&&(!Array.isArray(c.creatives)||c.creatives.length>17||new Set(c.creatives.map(s=>s?.id)).size!==c.creatives.length||new Set(c.creatives.map(s=>s?.placement)).size!==c.creatives.length||c.creatives.some(s=>!s||Object.keys(s).some(k=>!['id','placement','imageUrl','imageAlt','width','height','approvalReference'].includes(k))||typeof s.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(s.id)||typeof s.imageAlt!=='string'||typeof s.approvalReference!=='string'||!s.approvalReference.trim()||s.approvalReference.length>500||!c.placements.includes(s.placement)||!isSponsorPlacement(s.placement)||
    !validCreative({...s,locale:c.locale,approved:true,enabled:true,startsAt:null,endsAt:null},{locale:c.locale,pagePath:'/'+c.locale,placement:s.placement},Date.now()))))return null;
  return c;
}
export async function configureCampaign(db:DatabaseClient,c:CampaignConfiguration){if(!parseCampaignConfiguration(c))throw Error('INVALID_APPROVED_CONFIGURATION');return db.transaction(async q=>{
  const row=(await q.query(`SELECT b.id AS bookmaker_id,c.id AS country_id FROM bookmakers b JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id JOIN countries c ON c.id=g.country_id
    WHERE b.provider_slug=$1 AND c.iso2=$2 AND b.affiliate_status='ACTIVE' AND b.enabled AND g.affiliate_enabled AND g.odds_enabled AND g.comparison_enabled AND g.verified_at IS NOT NULL AND g.verification_state IN ($3,'VERIFIED_BR_MX')`,[c.bookmaker,c.locale.toUpperCase(),c.locale==='br'?'VERIFIED_BR':'VERIFIED_MX'])).rows[0];
  if(!row||c.bookmaker==='betano.bet.br'&&c.locale!=='br')throw Error('EXISTING_COMMERCIAL_APPROVAL_REQUIRED');
  const link=(await q.query(`INSERT INTO affiliate_links(bookmaker_id,country_id,destination_url,enabled,approved_at,campaign_verified,approved_placement)
    VALUES($1,$2,$3,true,now(),true,'match-odds') ON CONFLICT(bookmaker_id,country_id) DO UPDATE SET destination_url=excluded.destination_url,enabled=true,approved_at=now(),campaign_verified=true,approved_placement='match-odds',updated_at=now() RETURNING id`,[row.bookmaker_id,row.country_id,c.destinationUrl])).rows[0];
  const campaign=(await q.query(`INSERT INTO affiliate_campaigns(affiliate_link_id,operator_campaign_id,destination_type,enabled,approved_at,approval_reference,valid_from,valid_until,placement_allowlist,operator_domain_allowlist)
    VALUES($1,$2,$3,$4,now(),$5,$6,$7,$8,$9) ON CONFLICT(affiliate_link_id,operator_campaign_id) DO UPDATE SET destination_type=excluded.destination_type,enabled=excluded.enabled,approved_at=now(),approval_reference=excluded.approval_reference,valid_from=excluded.valid_from,valid_until=excluded.valid_until,placement_allowlist=excluded.placement_allowlist,operator_domain_allowlist=excluded.operator_domain_allowlist,updated_at=now() RETURNING id`,
    [link.id,c.operatorCampaignId,c.destinationType,c.enabled,c.approvalReference,c.validFrom,c.validUntil,c.placements,c.domains])).rows[0];
  // A jurisdiction has one canonical destination. Replacing it retires other
  // campaign identities so an old signed offer cannot route under a new campaign.
  await q.query('UPDATE affiliate_campaigns SET enabled=false,updated_at=now() WHERE affiliate_link_id=$1 AND id<>$2',[link.id,campaign.id]);
  // Omitted creatives are disabled; campaign edits cannot leave an old ad active.
  await q.query('UPDATE profile_sponsor_campaigns SET enabled=false WHERE affiliate_campaign_id=$1',[campaign.id]);
  for(const s of c.creatives??[]){const saved=await q.query(`INSERT INTO profile_sponsor_campaigns(id,affiliate_campaign_id,enabled,locale,placement,label,image_url,image_alt,approved_at,approval_reference,creative_width,creative_height,starts_at,ends_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,locale=excluded.locale,placement=excluded.placement,label=excluded.label,image_url=excluded.image_url,image_alt=excluded.image_alt,approved_at=now(),approval_reference=excluded.approval_reference,creative_width=excluded.creative_width,creative_height=excluded.creative_height,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now()
    WHERE profile_sponsor_campaigns.affiliate_campaign_id=excluded.affiliate_campaign_id`,
    [s.id,campaign.id,c.enabled,c.locale,s.placement,c.locale==='br'?'Publicidade':'Publicidad',s.imageUrl,s.imageAlt,s.approvalReference,s.width,s.height,c.validFrom,c.validUntil]);if(saved.rowCount!==1)throw Error('CREATIVE_BELONGS_TO_ANOTHER_CAMPAIGN');}
  return {campaignId:campaign.id,bookmaker:c.bookmaker,locale:c.locale,enabled:c.enabled,destinationConfigured:true};
});}
