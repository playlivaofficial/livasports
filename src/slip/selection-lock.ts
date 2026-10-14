import type {CanonicalSelection,ReferencePrice,ResolvedSelection} from './types';
import {selectionKey} from './types';
import {buildComparison} from '@/odds/comparison';
import type {SlipFixtureRead} from './resolution';
import {resolveSelection} from './resolution';
import {currentEstimate} from '@/odds/calculated-estimate';
import {bookmakerConfig} from '@/odds/registry';

export interface SelectionLock {v:1|2;key:string;geo:string;book:string;quote:string;provider:string;price:string;observed:string;expires:number;
  priceKind?:'CALCULATED_MINUS_10';sourceBook?:string;sourcePrice?:string;}
/** Search the entire entitled local pool, never the foreign informational channel or synthetic prices. */
export function selectablePrices(selection:CanonicalSelection,read:SlipFixtureRead|null,now:number):ReferencePrice[] {
  if(!read||read.fixture.status!=='SCHEDULED'||!Number.isFinite(Date.parse(read.fixture.kickoff))||now>=Date.parse(read.fixture.kickoff))return [];
  return buildComparison(read.snapshot,selection.market,now).rows.flatMap(row=>row.cells.filter(c=>
    c.outcome===selection.outcome&&c.state==='ACTIVE'&&c.priceKind==='REAL'&&c.sourceBookmaker===row.bookmaker&&
    !!c.sourceQuoteId&&!!c.sourceObservedAt&&Number(c.decimalOdds)>1&&Number(c.decimalOdds)<=1000&&!!c.expiresAt&&Date.parse(c.expiresAt)>now)
    .map(c=>({bookmaker:row.bookmaker,bookmakerName:row.name,decimalOdds:c.decimalOdds!,expiresAt:c.expiresAt!,best:c.best,
      priceKind:'REAL' as const,sourceBookmaker:c.sourceBookmaker!,sourceQuoteId:c.sourceQuoteId!,sourceObservedAt:c.sourceObservedAt!})));
}
/** Planning admission is distinct from executable bookmaker availability. No foreign references. */
export function selectableComparisonPrices(selection:CanonicalSelection,read:SlipFixtureRead|null,now:number):ReferencePrice[] {
  const real=selectablePrices(selection,read,now);
  if(!read||!real.length)return real;
  const comparison=buildComparison(read.snapshot,selection.market,now);
  const estimates=(comparison.estimates??[]).filter(e=>currentEstimate(e,now)&&e.fixtureId===read.snapshot.fixtureId&&
    e.market===selection.market&&e.outcome===selection.outcome&&e.line===selection.line&&e.scope===selection.scope&&
    !real.some(p=>p.bookmaker===e.targetBookmaker));
  return [...real,...estimates.map(e=>({bookmaker:e.targetBookmaker,bookmakerName:bookmakerConfig(e.targetBookmaker)?.displayName??e.targetBookmaker,
    decimalOdds:e.decimalOdds,expiresAt:e.expiresAt,best:false,priceKind:'CALCULATED_MINUS_10' as const,
    sourceBookmaker:e.sourceBookmaker,sourceQuoteId:e.sourceQuoteId,sourceObservedAt:e.sourceObservedAt,estimate:e}))];
}
export function resolveLockedSelection(selection:CanonicalSelection,read:SlipFixtureRead|null,lock:SelectionLock|null,geo:string|null,now:number):ResolvedSelection {
  const base={...resolveSelection(selection,read,now),comparisonAuthorized:!!lock&&lock.key===selectionKey(selection)&&lock.geo===geo};
  const prices=selectablePrices(selection,read,now);
  // V2 signs an indicative planning choice, not a frozen executable offer. Re-read
  // current local truth on every resolution; genuine recovery wins for that same book.
  if(lock?.v===2&&lock.priceKind==='CALCULATED_MINUS_10'&&lock.key===selectionKey(selection)&&lock.geo===geo){
    const price=selectableComparisonPrices(selection,read,now).find(p=>p.bookmaker===lock.book);
    if(price)return {...base,state:'CURRENT',reason:null,coverage:price.priceKind==='REAL'?'REAL':'INDICATIVE',price,alternative:undefined};
  }
  const alternative=prices.sort((a,b)=>Number(b.decimalOdds)-Number(a.decimalOdds)||a.bookmaker.localeCompare(b.bookmaker))[0];
  const candidate=prices.find(p=>p.bookmaker===lock?.book&&p.sourceQuoteId===lock.quote&&Number(p.decimalOdds)===Number(lock.price));
  const underlying=read?.snapshot.quotes.find(q=>q.quoteId===lock?.quote&&q.bookmaker===lock.book);
  if(lock?.v===1&&lock.key===selectionKey(selection)&&lock.geo===geo&&lock.expires>now&&candidate&&underlying&&
    (underlying.provider??'ODDSPAPI')===lock.provider){
    return {...base,state:'CURRENT',reason:null,coverage:'REAL',price:{...candidate,expiresAt:new Date(Math.min(lock.expires,Date.parse(candidate.expiresAt))).toISOString()},alternative:undefined};
  }
  const closed=['MATCH_FINISHED','MATCH_STARTED','CLOSED'].includes(base.state);
  return {...base,state:closed?base.state:'SUSPENDED',coverage:'UNAVAILABLE',price:null,...(!closed&&alternative?{alternative}:{})};
}
