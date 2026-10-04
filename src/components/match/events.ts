'use client';
import type {SiteLocale} from '@/config/i18n';
import {bridgeLegacyEvent} from '@/analytics/client';
export interface MatchEventContext { fixtureId:string;competitionId:string;locale:SiteLocale; }
export type MatchEventName='match_open'|'match_tab_view'|'odds_module_view'|'odds_market_view'|'odds_bookmaker_click'|'odds_unavailable_view'|'match_share';
export function emitProductEvent(payload:Record<string,unknown>,key:string,analytics:Record<string,unknown>={}):void{
  if(typeof window==='undefined')return;
  // P4: the same interaction feeds the first-party analytics taxonomy (its own dedupe; extras never reach the legacy parsers).
  bridgeLegacyEvent({...payload,...analytics});
  try{const now=Date.now();if(now-Number(sessionStorage.getItem(key)??0)<10000)return;sessionStorage.setItem(key,String(now));}catch{/* Analytics never blocks product interaction. */}
  try{void fetch('/api/events',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({...payload,eventId:crypto.randomUUID()})}).catch(()=>undefined);}catch{/* Optional telemetry is best-effort. */}
}
export function emitMatchEvent(eventName:MatchEventName,context:MatchEventContext,placement:string,extra:{market?:string;bookmaker?:string}={}):void{
  if(typeof window==='undefined')return;
  const key=`ls:${eventName}:${context.locale}:${context.fixtureId}:${placement}:${extra.market??''}:${extra.bookmaker??''}`;
  emitProductEvent({eventName,...context,placement,...extra},key);
}
