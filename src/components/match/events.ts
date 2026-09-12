'use client';
export interface MatchEventContext { fixtureId:string;competitionId:string;locale:'br'|'mx'; }
export type MatchEventName='match_open'|'match_tab_view'|'odds_module_view'|'odds_market_view'|'odds_bookmaker_click'|'odds_unavailable_view'|'match_share';
export function emitMatchEvent(eventName:MatchEventName,context:MatchEventContext,placement:string,extra:{market?:string;bookmaker?:string}={}):void{
  if(typeof window==='undefined')return;
  const key=`ls:${eventName}:${context.locale}:${context.fixtureId}:${placement}:${extra.market??''}:${extra.bookmaker??''}`;
  try{const now=Date.now();if(now-Number(sessionStorage.getItem(key)??0)<10000)return;sessionStorage.setItem(key,String(now));}catch{/* Tracking must never block navigation. */}
  try{void fetch('/api/events',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},
    body:JSON.stringify({eventId:crypto.randomUUID(),eventName,...context,placement,...extra})}).catch(()=>undefined);
  }catch{/* Storage, UUID generation or synchronous transport errors cannot interrupt an outbound link. */}
}
