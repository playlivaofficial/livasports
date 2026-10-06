import type {SiteLocale} from '@/config/i18n';
import {isVisibleBookmaker} from './registry';

// Only jurisdiction-specific destinations. Generic .com never proves BR/MX availability.
const hosts:Record<string,readonly string[]>={
  'betano.bet.br:br':['betano.bet.br','www.betano.bet.br'],
  // Exact BR tracking host observed in the authenticated approved sportsbook link.
  'betsson:br':['betsson.bet.br','www.betsson.bet.br','record.betsson.bet.br'],
  // Operator domain plus the exact tracking host from the collected MX affiliate inventory.
  'betsson:mx':['betsson.mx','www.betsson.mx','record.betsson.mx'],
  // Jurisdiction destination allowlists only. These authorise nothing on their own: an outbound link
  // still needs an approved campaign row, and migration 057/063 keep affiliate_enabled false.
  'betsson:co':['betsson.co','www.betsson.co','record.betsson.co'],
  // bwin Colombia is odds-only: no Entain affiliate access exists, so it gets no tracking host.
  'bwin:co':['sports.bwin.co','www.bwin.co','bwin.co'],
  'inkabet:pe':['inkabet.pe','www.inkabet.pe','record.inkabet.pe'],
  // The exact domain the MINCETUR register of authorisation holders names for 1xBet Peru (Terminus
  // Platform Peru SAC, RD 4249-2024, registro 21002610010000, VIGENTE), verified 2026-10-07. No
  // tracking host: the approved Peru creative is the operator's own partner iframe, which carries its
  // tracking internally. PE is listed here and BR is not, so a Peruvian licence authorises Peru only.
  '1xbet:pe':['1xbet.pe','www.1xbet.pe'],
  'sportingbet.bet.br:br':['sportingbet.bet.br','www.sportingbet.bet.br','sports.sportingbet.bet.br'],
  // Approved partner links use the exact BR tracking host. Private campaign IDs stay server-side.
  '1xbet:br':['1xaff.com.br','www.1xaff.com.br'],
  // Betboo is retired and `isVisibleBookmaker` already refuses it, so its destination is removed
  // rather than left as a dormant allowlist entry a later change could re-enable.
};
export const ODDS_PLACEMENT='match-odds';
export function validOutboundRequest(bookmaker:string,query:URLSearchParams){
  const fixture=query.get('fixtureId')??'';
  return isVisibleBookmaker(bookmaker)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixture)&&
    ['br','mx','co','pe'].includes(query.get('locale')??'')&&['MATCH_WINNER','TOTAL_GOALS','BTTS'].includes(query.get('market')??'')&&query.get('placement')===ODDS_PLACEMENT&&
    [...query.keys()].every(k=>['fixtureId','locale','market','placement'].includes(k)&&query.getAll(k).length===1);
}
export function safeAffiliateDestination(bookmaker:string,locale:SiteLocale,destination:unknown,configuredDomains?:readonly string[]):string|null{
  if(!isVisibleBookmaker(bookmaker))return null;
  if(typeof destination!=='string'||destination.length>4096||/[\s\\\u0000-\u001f\u007f]/.test(destination)||/%0[ad]/i.test(destination))return null;
  try{const url=new URL(destination);if(url.protocol!=='https:'||url.username||url.password||url.port||!safeOperatorHost(url.hostname)||!(configuredDomains??hosts[`${bookmaker}:${locale}`])?.includes(url.hostname))return null;
    return url.toString();}catch{return null;}
}
/** Domain allowlists are server-owned configuration, never copied from public request fields. */
export function safeOperatorHost(host:string):boolean{return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)&&!/(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(host)&&!/^\d+(?:\.\d+){3}$/.test(host);}
