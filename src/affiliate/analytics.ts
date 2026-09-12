import 'server-only';
import {randomUUID} from 'node:crypto';
import type {QueryExecutor} from '@/database/client';
import {marketSummary} from './repository';
import {clickDedup} from './tokens';
import type {TrafficClass,VerifiedOffer} from './types';
export async function recordClick(db:QueryExecutor,offer:VerifiedOffer,viewId:string,traffic:TrafficClass,key:string,now=Date.now()){
  const {campaign:c,context:x,page:p}=offer;const id=randomUUID();
  // Legacy PII/referrer columns are intentionally never populated. M8 CHECK guards this.
  const result=await db.query(`INSERT INTO affiliate_clicks(id,affiliate_link_id,campaign_id,bookmaker_id,fixture_id,team_id,player_id,competition_id,
    locale,geo,placement_id,page_type,page_path,selection_count,markets_summary,destination_type,redirect_status,traffic_class,dedup_key)
    SELECT $1,$2,$3,b.id,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,'ISSUED_303',$16,$17 FROM bookmakers b WHERE b.provider_slug=$18
    AND (SELECT count(*) FROM affiliate_clicks WHERE campaign_id=$3 AND clicked_at>now()-interval '1 minute')<120
    ON CONFLICT(dedup_key) DO NOTHING RETURNING id`,[id,c.linkId,c.id,p.fixtureId??null,p.teamId??null,p.playerId??null,p.competitionId??null,
    x.locale,x.locale.toUpperCase(),x.placement,p.pageType,p.pagePath,x.selections?.length??(x.market?1:0),JSON.stringify(marketSummary(x)),c.destinationType,traffic,clickDedup(viewId,now,key),c.bookmaker]);
  return result.rows[0]?.id??null;
}
export async function recordImpression(db:QueryExecutor,offer:VerifiedOffer,viewId:string,traffic:TrafficClass){
  const {campaign:c,context:x,page:p}=offer;
  await db.query(`INSERT INTO affiliate_impressions(id,campaign_id,bookmaker_id,placement_id,locale,geo,page_type,page_path,
    fixture_id,team_id,player_id,competition_id,selection_count,markets_summary,traffic_class)
    SELECT $1,$2,b.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14 FROM bookmakers b WHERE b.provider_slug=$15
    AND (SELECT count(*) FROM affiliate_impressions WHERE campaign_id=$2 AND occurred_at>now()-interval '1 minute')<600
    ON CONFLICT(id) DO NOTHING`,[viewId,c.id,x.placement,x.locale,x.locale.toUpperCase(),p.pageType,p.pagePath,p.fixtureId??null,p.teamId??null,p.playerId??null,p.competitionId??null,
    x.selections?.length??(x.market?1:0),JSON.stringify(marketSummary(x)),traffic,c.bookmaker]);
}
export async function recordOperationalError(db:QueryExecutor,code:'CONFIG_READ_FAILED'|'ATTRIBUTION_WRITE_FAILED'){
  await db.query('UPDATE affiliate_operational_state SET last_redirect_error_at=now(),last_redirect_error=$1 WHERE id=true',[code]);
}
