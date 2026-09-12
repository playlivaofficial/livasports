import {safeAffiliateDestination} from '@/odds/affiliate';
import type {Placement,DestinationType} from './types';
// SQL supplies only server-side campaign metadata; no operator campaign ID or
// destination escapes to public models. Also reject ambiguous active campaigns.
export const activeCampaignSql=`(SELECT jsonb_agg(jsonb_build_object('type',ac.destination_type,'placements',ac.placement_allowlist,'domains',ac.operator_domain_allowlist))
  FROM affiliate_campaigns ac WHERE ac.affiliate_link_id=al.id AND ac.enabled AND ac.approved_at IS NOT NULL AND now()>=ac.valid_from AND now()<ac.valid_until)`;
export function availableDestination(bookmaker:string,locale:'br'|'mx',destination:unknown,campaigns:unknown,placement:Placement):{url:string;type:DestinationType}|null{
  const url=safeAffiliateDestination(bookmaker,locale,destination);if(!url||!Array.isArray(campaigns))return null;const host=new URL(url).hostname;
  const matches=campaigns.filter(c=>c&&['HOMEPAGE','SPORTSBOOK'].includes(c.type)&&Array.isArray(c.placements)&&c.placements.includes(placement)&&Array.isArray(c.domains)&&c.domains.includes(host));
  return matches.length===1?{url,type:matches[0].type}:null;
}
