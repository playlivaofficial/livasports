import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {canonicalSelection} from './types';
export const slipEvents=new Set(['slip_open','slip_selection_add','slip_selection_replace','slip_selection_remove','slip_clear','slip_state_invalidated']);
export function parseSlipEvent(body:Record<string,unknown>){
  if(!slipEvents.has(String(body.eventName))||(body.locale!=='br'&&body.locale!=='mx')||body.placement!=='guest-slip'||
    Object.keys(body).some(k=>!['eventId','eventName','locale','placement','selection','bookmaker'].includes(k)))return null;
  if(body.bookmaker!==undefined&&!['betano.bet.br','betsson'].includes(String(body.bookmaker)))return null;
  const selection=body.selection===undefined?null:canonicalSelection(body.selection,true);
  const aggregate=body.eventName==='slip_open'||body.eventName==='slip_clear';
  if(aggregate?body.selection!==undefined:!selection)return null;
  return {eventName:body.eventName,locale:body.locale,selection,bookmaker:body.bookmaker??null,eventId:body.eventId};
}
export async function recordSlipEvent(db:QueryExecutor,event:NonNullable<ReturnType<typeof parseSlipEvent>>){
  const s=event.selection;
  await db.query(`INSERT INTO product_events(event_id,event_name,fixture_id,competition_id,locale,placement,bookmaker,market,outcome,line)
    SELECT $1,$2,f.id,f.competition_id,$4,'guest-slip',$5,$6,$7,$8
    FROM (SELECT 1) seed LEFT JOIN fixtures f ON f.public_id=$3
    WHERE ($3::text IS NULL OR f.id IS NOT NULL)
      AND (SELECT count(*) FROM product_events recent WHERE recent.fixture_id IS NOT DISTINCT FROM f.id
        AND recent.locale=$4 AND recent.occurred_at>now()-interval '1 minute')<120
    ON CONFLICT(event_id) DO NOTHING`,[event.eventId,event.eventName,s?.fixturePublicId??null,event.locale,event.bookmaker,s?.market??null,s?.outcome??null,s?.line??null]);
}
