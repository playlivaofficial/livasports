import 'server-only';
import {createHash} from 'node:crypto';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {placements,type Campaign,type CreativeDelivery,type Placement} from './types';
import {campaignDestination,isSponsorPlacement,validCreative} from './policy';
import {isVisibleBookmaker,type BookmakerId} from '@/odds/registry';
import type {SiteLocale} from '@/config/i18n';
import {safeAffiliateDestination,safeOperatorHost} from '@/odds/affiliate';
import {isCoreGeo} from '@/config/geo';
import {embedTrackingHost} from './embed-policy';
export interface CampaignConfiguration {
  bookmaker:BookmakerId;locale:SiteLocale;operatorCampaignId:string;destinationUrl:string;destinationType:'HOMEPAGE'|'SPORTSBOOK';
  enabled:boolean;validFrom:string;validUntil:string;placements:Placement[];domains:string[];approvalReference:string;
  creatives?:Array<{id:string;placement:Placement;imageUrl?:string;imageAlt:string;width:number;height:number;approvalReference:string;delivery?:CreativeDelivery;embedSourceUrl?:string}>;
}
export function parseCampaignConfiguration(value:unknown):CampaignConfiguration|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;const c=value as CampaignConfiguration;
  if(Object.keys(c).some(k=>!['bookmaker','locale','operatorCampaignId','destinationUrl','destinationType','enabled','validFrom','validUntil','placements','domains','approvalReference','creatives'].includes(k))||
    !isVisibleBookmaker(c.bookmaker)||!['br','mx','co','pe'].includes(c.locale)||typeof c.enabled!=='boolean'||
    typeof c.operatorCampaignId!=='string'||!c.operatorCampaignId.trim()||c.operatorCampaignId.length>160||typeof c.approvalReference!=='string'||!c.approvalReference.trim()||c.approvalReference.length>500||
    !Array.isArray(c.placements)||!c.placements.length||c.placements.length>17||new Set(c.placements).size!==c.placements.length||c.placements.some(p=>!placements.includes(p))||
    !Array.isArray(c.domains)||!c.domains.length||c.domains.length>8||c.domains.some(d=>typeof d!=='string'||!safeOperatorHost(d))||
    typeof c.validFrom!=='string'||typeof c.validUntil!=='string'||!Number.isFinite(Date.parse(c.validFrom))||!Number.isFinite(Date.parse(c.validUntil))||Date.parse(c.validUntil)<=Date.parse(c.validFrom))return null;
  const campaign={enabled:true,approved:true,affiliateApproved:true,geoEligible:true,locale:c.locale,bookmaker:c.bookmaker,placements:c.placements,domains:c.domains,operatorDomains:c.domains,
    destination:c.destinationUrl,destinationType:c.destinationType,operatorCampaignId:c.operatorCampaignId,startsAt:c.validFrom,endsAt:c.validUntil} as Campaign;
  if(!campaignDestination(campaign,{locale:c.locale,pagePath:'/'+c.locale,placement:c.placements[0]},Date.parse(c.validFrom)))return null;
  if(c.creatives!==undefined&&(!Array.isArray(c.creatives)||c.creatives.length>17||new Set(c.creatives.map(s=>s?.id)).size!==c.creatives.length||new Set(c.creatives.map(s=>s?.placement)).size!==c.creatives.length||c.creatives.some(s=>!s||Object.keys(s).some(k=>!['id','placement','imageUrl','imageAlt','width','height','approvalReference','delivery','embedSourceUrl'].includes(k))||typeof s.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(s.id)||typeof s.imageAlt!=='string'||typeof s.approvalReference!=='string'||!s.approvalReference.trim()||s.approvalReference.length>500||!c.placements.includes(s.placement)||!isSponsorPlacement(s.placement)||s.delivery==='BETSSON_EMBED'&&!embedTrackingHost(c.bookmaker,c.locale)||
    !validCreative({...s,imageUrl:s.imageUrl??null,locale:c.locale,approved:true,enabled:true,startsAt:null,endsAt:null},{locale:c.locale,pagePath:'/'+c.locale,placement:s.placement},Date.now(),c.operatorCampaignId,c.bookmaker))))return null;
  return c;
}
export async function configureCampaign(db:DatabaseClient,c:CampaignConfiguration){return db.transaction(async q=>{
  const saved=await configureCampaignInTransaction(q,c);
  // Maintenance edits share the owner's revocation contract, even if the campaign ID is reused.
  const row=(await q.query(`UPDATE bookmaker_geo_availability g SET commercial_version=commercial_version+1,last_validated_at=now(),updated_at=now()
    FROM bookmakers b,countries c WHERE g.bookmaker_id=b.id AND g.country_id=c.id AND b.provider_slug=$1 AND c.iso2=$2
    RETURNING g.bookmaker_id,g.country_id,g.commercial_version`,[c.bookmaker,c.locale.toUpperCase()])).rows[0];
  if(!row)throw Error('EXISTING_COMMERCIAL_APPROVAL_REQUIRED');
  await q.query(`INSERT INTO operator_activation_audit(bookmaker_id,country_id,actor_id,action,version,campaign_id,destination_hash,approval_reference)
    VALUES($1,$2,'trusted-maintenance-cli','RECONFIGURE',$3,$4,$5,$6)`,[row.bookmaker_id,row.country_id,row.commercial_version,saved.campaignId,createHash('sha256').update(c.destinationUrl).digest('hex'),c.approvalReference]);
  return saved;
});}
/** Caller may share a transaction with approval and an audit record. Never trusts request domain lists. */
export async function configureCampaignInTransaction(q:QueryExecutor,c:CampaignConfiguration){
  if(!parseCampaignConfiguration(c)||!isCoreGeo(c.locale.toUpperCase()))throw Error('INVALID_APPROVED_CONFIGURATION');
  const row=(await q.query(`SELECT b.id AS bookmaker_id,c.id AS country_id,g.destination_domains FROM bookmakers b JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id JOIN countries c ON c.id=g.country_id
    WHERE b.provider_slug=$1 AND c.iso2=$2 AND b.enabled AND g.commercial_status='ACTIVE' AND g.affiliate_enabled AND g.sportsbook_enabled
      AND g.legal_status='VERIFIED' AND g.legal_verified_at IS NOT NULL AND NULLIF(trim(g.legal_reference),'') IS NOT NULL
      AND g.odds_enabled AND g.comparison_enabled AND g.verified_at IS NOT NULL AND g.verification_state IN ('VERIFIED',$3)
      AND EXISTS(SELECT 1 FROM operator_provider_mappings opm WHERE opm.bookmaker_id=b.id AND opm.country_id=c.id AND opm.verified_at IS NOT NULL)
    FOR UPDATE OF g`,[c.bookmaker,c.locale.toUpperCase(),`VERIFIED_${c.locale.toUpperCase()}`])).rows[0];
  if(!row||!safeAffiliateDestination(c.bookmaker,c.locale,c.destinationUrl,row.destination_domains??[])||c.domains.some(d=>!row.destination_domains.includes(d)))throw Error('EXISTING_COMMERCIAL_APPROVAL_REQUIRED');
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
  for(const s of c.creatives??[]){const saved=await q.query(`INSERT INTO profile_sponsor_campaigns(id,affiliate_campaign_id,enabled,locale,placement,label,image_url,image_alt,approved_at,approval_reference,creative_width,creative_height,starts_at,ends_at,delivery_type,embed_source_url)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,locale=excluded.locale,placement=excluded.placement,label=excluded.label,image_url=excluded.image_url,image_alt=excluded.image_alt,approved_at=now(),approval_reference=excluded.approval_reference,creative_width=excluded.creative_width,creative_height=excluded.creative_height,starts_at=excluded.starts_at,ends_at=excluded.ends_at,delivery_type=excluded.delivery_type,embed_source_url=excluded.embed_source_url,updated_at=now()
    WHERE profile_sponsor_campaigns.affiliate_campaign_id=excluded.affiliate_campaign_id`,
    [s.id,campaign.id,c.enabled,c.locale,s.placement,c.locale==='br'?'Publicidade':'Publicidad',s.imageUrl??null,s.imageAlt,s.approvalReference,s.width,s.height,c.validFrom,c.validUntil,s.delivery??'IMAGE',s.embedSourceUrl??null]);if(saved.rowCount!==1)throw Error('CREATIVE_BELONGS_TO_ANOTHER_CAMPAIGN');}
  return {campaignId:campaign.id,bookmaker:c.bookmaker,locale:c.locale,enabled:c.enabled,destinationConfigured:true};
}
