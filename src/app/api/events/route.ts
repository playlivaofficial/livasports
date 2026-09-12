import { databaseUrl, PostgresDatabaseClient } from '@/database/client';

const names = new Set(['match_open','match_tab_view','odds_module_view','odds_market_view','odds_bookmaker_click','odds_unavailable_view','affiliate_outbound_click','match_share']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const origin=request.headers.get('origin');
  if(origin){try{if(new URL(origin).host!==new URL(request.url).host)return new Response(null,{status:403});}
    catch{return new Response(null,{status:403});}}
  const payload=await request.text().catch(()=>'');
  if(new TextEncoder().encode(payload).byteLength>2048)return new Response(null,{status:413});
  const body=(()=>{try{return JSON.parse(payload) as Record<string,unknown>;}catch{return null;}})();
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
