import type {QueryExecutor} from '@/database/client';
import {isCoreGeo,type CoreGeo} from '@/config/geo';
import {isVisibleBookmaker} from './registry';

export interface VerifiedOperatorFeed {geo:CoreGeo;operatorId:string;providerBookmakerId:string;sourceDomains:string[];}
/** Technical eligibility is separate from affiliate approval. No registry name guesses become requests. */
export async function readVerifiedOperatorFeeds(db:QueryExecutor):Promise<VerifiedOperatorFeed[]>{
  const {rows}=await db.query(`SELECT c.iso2 AS geo,b.provider_slug AS operator_id,p.provider_bookmaker_id,g.source_domains
    FROM operator_provider_mappings p JOIN bookmakers b ON b.id=p.bookmaker_id
    JOIN countries c ON c.id=p.country_id
    JOIN bookmaker_geo_availability g ON g.bookmaker_id=b.id AND g.country_id=c.id
    WHERE p.provider='ODDSPAPI' AND p.verified_at IS NOT NULL AND c.iso2 IN ('MX','CO','PE')
      AND b.enabled AND g.sportsbook_enabled AND g.odds_enabled AND g.comparison_enabled
      AND g.legal_status='VERIFIED' AND g.verified_at IS NOT NULL
      AND g.verification_state IN ('VERIFIED','VERIFIED_'||c.iso2)
      AND g.legal_verified_at IS NOT NULL AND NULLIF(trim(g.legal_reference),'') IS NOT NULL
    ORDER BY p.provider_bookmaker_id,c.iso2`);
  const feeds=rows.flatMap(r=>isCoreGeo(r.geo)&&isVisibleBookmaker(r.operator_id)&&typeof r.provider_bookmaker_id==='string'&&/^[a-z0-9][a-z0-9._-]{0,99}$/.test(r.provider_bookmaker_id)
    &&Array.isArray(r.source_domains)&&r.source_domains.length?[{geo:r.geo,operatorId:String(r.operator_id),providerBookmakerId:r.provider_bookmaker_id,sourceDomains:r.source_domains.map(String)}]:[]);
  for(const feed of feeds)if(feeds.some(other=>other.providerBookmakerId===feed.providerBookmakerId&&other.operatorId!==feed.operatorId))throw new Error('ODDS_AMBIGUOUS_OPERATOR_FEED');
  return feeds;
}
export function feedsForProvider(feeds:readonly VerifiedOperatorFeed[],id:string){return feeds.filter(feed=>feed.providerBookmakerId===id);}
