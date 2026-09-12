import 'server-only';
import type {QueryExecutor} from '@/database/client';
export const comparisonEvents=new Set(['slip_comparison_view','slip_bookmaker_complete','slip_bookmaker_partial','slip_best_price_view','slip_bookmaker_click']);
export function parseComparisonEvent(body:Record<string,unknown>){
  if(!comparisonEvents.has(String(body.eventName))||(body.locale!=='br'&&body.locale!=='mx')||body.placement!=='slip-comparison'||
    Object.keys(body).some(k=>!['eventId','eventName','locale','placement','selectionCount','marketsSummary','bookmaker','availableCount','complete'].includes(k)))return null;
  if(!Number.isInteger(body.selectionCount)||Number(body.selectionCount)<0||Number(body.selectionCount)>10)return null;
  const markets=body.marketsSummary;
  if(!markets||typeof markets!=='object'||Array.isArray(markets))return null;
  const summary=markets as Record<string,unknown>,names=['MATCH_WINNER','TOTAL_GOALS','BTTS'];
  if(Object.keys(summary).length!==3||Object.keys(summary).some(k=>!names.includes(k))||
    Object.values(summary).some(v=>!Number.isInteger(v)||Number(v)<0||Number(v)>10)||Object.values(summary).reduce<number>((n,v)=>n+Number(v),0)!==body.selectionCount)return null;
  const aggregate=body.eventName==='slip_comparison_view';
  if(aggregate){if(['bookmaker','availableCount','complete'].some(k=>body[k]!==undefined))return null;}
  else{
    if(!['betsson','betano.bet.br'].includes(String(body.bookmaker))||!Number.isInteger(body.availableCount)||Number(body.availableCount)<0||Number(body.availableCount)>Number(body.selectionCount)||typeof body.complete!=='boolean')return null;
    if(body.complete!==(Number(body.selectionCount)>0&&body.availableCount===body.selectionCount))return null;
    if(body.eventName==='slip_bookmaker_partial'?body.complete:!body.complete)return null;
  }
  return {eventId:body.eventId,eventName:body.eventName,locale:body.locale,selectionCount:body.selectionCount,marketsSummary:summary,
    bookmaker:body.bookmaker??null,availableCount:body.availableCount??null,complete:body.complete??null};
}
export async function recordComparisonEvent(db:QueryExecutor,event:NonNullable<ReturnType<typeof parseComparisonEvent>>){
  await db.query(`INSERT INTO product_events(event_id,event_name,locale,placement,bookmaker,selection_count,available_count,complete,markets_summary)
    SELECT $1,$2,$3,'slip-comparison',$4,$5,$6,$7,$8::jsonb
    WHERE (SELECT count(*) FROM product_events WHERE placement='slip-comparison' AND locale=$3 AND occurred_at>now()-interval '1 minute')<120
    ON CONFLICT(event_id) DO NOTHING`,[event.eventId,event.eventName,event.locale,event.bookmaker,event.selectionCount,event.availableCount,event.complete,JSON.stringify(event.marketsSummary)]);
}
