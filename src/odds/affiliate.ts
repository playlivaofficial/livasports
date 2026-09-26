import type {SiteLocale} from '@/config/i18n';
import {isVisibleBookmaker} from './registry';

// Only jurisdiction-specific destinations. Generic .com never proves BR/MX availability.
const hosts:Record<string,readonly string[]>={
  'betano.bet.br:br':['betano.bet.br','www.betano.bet.br'],
  // Exact BR tracking host observed in the authenticated approved sportsbook link.
  'betsson:br':['betsson.bet.br','www.betsson.bet.br','record.betsson.bet.br'],
  'betsson:mx':['betsson.mx','www.betsson.mx'],
  'sportingbet.bet.br:br':['sportingbet.bet.br','www.sportingbet.bet.br','sports.sportingbet.bet.br'],
  // Removed in the same commit that retires Betboo in favour of 1xBet: while Betboo is still a public
  // card its approved destination must keep resolving.
  'betboo.bet.br:br':['betboo.bet.br','www.betboo.bet.br','sports.betboo.bet.br'],
};
export const ODDS_PLACEMENT='match-odds';
export function validOutboundRequest(bookmaker:string,query:URLSearchParams){
  const fixture=query.get('fixtureId')??'';
  return isVisibleBookmaker(bookmaker)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixture)&&
    ['br','mx'].includes(query.get('locale')??'')&&['MATCH_WINNER','TOTAL_GOALS','BTTS'].includes(query.get('market')??'')&&query.get('placement')===ODDS_PLACEMENT&&
    [...query.keys()].every(k=>['fixtureId','locale','market','placement'].includes(k)&&query.getAll(k).length===1);
}
export function safeAffiliateDestination(bookmaker:string,locale:SiteLocale,destination:unknown):string|null{
  if(!isVisibleBookmaker(bookmaker))return null;
  if(typeof destination!=='string'||destination.length>4096||/[\s\\\u0000-\u001f\u007f]/.test(destination)||/%0[ad]/i.test(destination))return null;
  try{const url=new URL(destination);if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts[`${bookmaker}:${locale}`]?.includes(url.hostname))return null;
    return url.toString();}catch{return null;}
}
