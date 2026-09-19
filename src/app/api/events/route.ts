import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import {parseSlipEvent,recordSlipEvent,slipEvents} from '@/slip/analytics-server';
import {parseComparisonEvent,recordComparisonEvent,comparisonEvents} from '@/slip/comparison-analytics-server';
import {boundedJson} from '@/slip/server';
import {embedClickRequest,impressionRequest} from '@/affiliate/server';
import {ownerPreview} from '@/owner/session';
import {classifyTraffic,ingestClientBatch} from '@/analytics/server';
import {requestLimit} from '@/security/request-limit';

const names = new Set(['match_open','match_tab_view','odds_module_view','odds_market_view','odds_bookmaker_click','odds_unavailable_view','affiliate_outbound_click','match_share']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const origin=request.headers.get('origin');
  if(origin){try{if(new URL(origin).host!==new URL(request.url).host)return new Response(null,{status:403});}
    catch{return new Response(null,{status:403});}}
  const limited=await requestLimit(request,'events');if(limited)return limited;
  let body:Record<string,unknown>|null;
  try{body=await boundedJson(request,65536) as Record<string,unknown>|null;}
  catch(error){return new Response(null,{status:error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400});}
  // P4 first-party analytics batches share this boundary; the legacy single-event contracts below are unchanged.
  if(body&&Array.isArray(body.batch)){const summary=await ingestClientBatch(request,body);return new Response(null,{status:summary.status,headers:{'Cache-Control':'private, no-store'}});}
  if(body?.eventName==='affiliate_impression')return impressionRequest(request,body);
  if(body?.eventName==='affiliate_embed_click')return embedClickRequest(request,body);
  // Affiliate QA remains attributable in its dedicated tables. Existing product
  // event tables have no traffic class, so preview must never enter that funnel.
  if(ownerPreview(request.headers)||classifyTraffic(request.headers,body?.qa===true)!=='HUMAN')return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}});
  if(body&&uuid.test(String(body.eventId??''))&&comparisonEvents.has(String(body.eventName??''))){
    const event=parseComparisonEvent(body);if(!event)return new Response(null,{status:400});
    const connection=databaseUrl();if(!connection)return new Response(null,{status:503});
    const db=new PostgresDatabaseClient(connection);
    try{await recordComparisonEvent(db,event);return new Response(null,{status:204});}
    catch{return new Response(null,{status:503});}finally{await db.close();}
  }
  if(body&&uuid.test(String(body.eventId??''))&&slipEvents.has(String(body.eventName??''))){
    const event=parseSlipEvent(body);if(!event)return new Response(null,{status:400});
    const connection=databaseUrl();if(!connection)return new Response(null,{status:503});
    const db=new PostgresDatabaseClient(connection);
    try{await recordSlipEvent(db,event);return new Response(null,{status:204});}
    catch{return new Response(null,{status:503});}finally{await db.close();}
  }
  if(!body||!uuid.test(String(body.eventId??''))||!uuid.test(String(body.fixtureId??''))||!uuid.test(String(body.competitionId??''))||
    !names.has(String(body.eventName??''))||!['br','mx'].includes(String(body.locale??''))) return new Response(null,{status:400});
  const connectionString=databaseUrl(); if(!connectionString) return new Response(null,{status:503});
  if(body.market!==undefined&&!['MATCH_WINNER','TOTAL_GOALS','BTTS'].includes(String(body.market)))return new Response(null,{status:400});
  if(body.bookmaker!==undefined&&!['betano.bet.br','betsson'].includes(String(body.bookmaker)))return new Response(null,{status:400});
  const database=new PostgresDatabaseClient(connectionString);
  try {
    await database.query(`INSERT INTO product_events(event_id,event_name,fixture_id,competition_id,locale,placement,bookmaker,market)
      SELECT $1,$2,f.id,f.competition_id,$4,$5,$6,$8 FROM fixtures f WHERE f.id=$3 AND f.competition_id=$7
      AND (SELECT count(*) FROM product_events recent WHERE recent.fixture_id=f.id AND recent.occurred_at>now()-interval '1 minute')<120
      ON CONFLICT(event_id) DO NOTHING`,[body.eventId,body.eventName,body.fixtureId,body.locale,
      typeof body.placement==='string'?body.placement.slice(0,80):null,typeof body.bookmaker==='string'?body.bookmaker:null,body.competitionId,body.market??null]);
    return new Response(null,{status:204});
  } catch { return new Response(null,{status:503}); }
  finally { await database.close(); }
}
