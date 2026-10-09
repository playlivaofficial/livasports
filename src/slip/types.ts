import type {SiteLocale} from '@/config/i18n';

export const SLIP_LIMIT = 10;
export const SLIP_SCOPE = 'FULL_TIME_REGULATION' as const;
export const SLIP_SCHEMA_VERSION = 2 as const;
export type CanonicalSelection = {fixturePublicId:string;scope:typeof SLIP_SCOPE} & (
  {market:'MATCH_WINNER';outcome:'HOME'|'DRAW'|'AWAY';line:null} |
  {market:'TOTAL_GOALS';outcome:'OVER'|'UNDER';line:2.5} |
  {market:'BTTS';outcome:'YES'|'NO';line:null}
);
export type BoundSelection = CanonicalSelection & {receipt?:string};
export type SavedSelection = BoundSelection & {addedAt:string};
/** Untrusted display hint only. Authentication always happens server-side against the HMAC and DB. */
export function receiptDisplay(value:BoundSelection):{book:string;price:string;expires:number;observed:string}|null {
  if(!value.receipt)return null;
  try{const parsed=JSON.parse(atob(value.receipt.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));
    if(Array.isArray(parsed)&&parsed.length!==9)return null;
    const v=Array.isArray(parsed)?{book:parsed[3],price:parsed[6],observed:parsed[7],expires:parsed[8]}:parsed;
    return typeof v.book==='string'&&typeof v.price==='string'&&typeof v.observed==='string'&&Number.isFinite(v.expires)?{book:v.book,price:v.price,expires:v.expires,observed:v.observed}:null;
  }catch{return null;}
}
export function wireSelection(value:CanonicalSelection):BoundSelection {
  const receipt=(value as BoundSelection).receipt;
  return {...canonicalSelection(value)!,...(typeof receipt==='string'?{receipt}:{})};
}
export interface StoredSlip {version:typeof SLIP_SCHEMA_VERSION;slipId:string;stake:string;selections:SavedSelection[];}
export type SelectionState = 'CURRENT'|'PRICE_CHANGED'|'STALE'|'UNAVAILABLE'|'SUSPENDED'|'CLOSED'|'MATCH_STARTED'|'MATCH_FINISHED';
export interface ReferencePrice {decimalOdds:string;bookmaker:string;bookmakerName:string;best:boolean;expiresAt:string;
  priceKind?:'REAL'|'PROXY'|'INDICATIVE';sourceBookmaker?:string;sourceQuoteId?:string;sourceObservedAt?:string;
  reference?:import('@/odds/types').IndicativeQuote;}
export interface ResolvedSelection {
  coverage?:'REAL'|'INDICATIVE'|'UNAVAILABLE';
  selection:CanonicalSelection;
  fixture:{publicId:string;home:string;away:string;competition:string;kickoff:string;status:string}|null;
  state:SelectionState;
  reason:'NO_VERIFIED_GEO'|'MISSING_FIXTURE'|'NO_QUOTE'|null;
  price:ReferencePrice|null;
  /** Informational proposal only; the user must explicitly accept through /api/slip/select. */
  alternative?:ReferencePrice;
  previousDecimalOdds?:string;
  closesAt:string|null;
}
export interface SlipResolution {locale:SiteLocale;resolvedAt:string;selections:ResolvedSelection[];providerRequests:0;}

export function selectionKey(s:CanonicalSelection):string {
  return `${s.fixturePublicId}:${s.scope}:${s.market}:${s.outcome}:${s.line??'none'}`;
}

/** One outcome per fixture + market + line. Compatible markets on the same fixture remain distinct. */
export function marketKey(s:Pick<CanonicalSelection,'fixturePublicId'|'scope'|'market'|'line'>):string {
  return `${s.fixturePublicId}:${s.scope}:${s.market}:${s.line??'none'}`;
}

export function uniqueFixtureIds(selections:readonly CanonicalSelection[]):string[] {
  return [...new Set(selections.map(s=>s.fixturePublicId))];
}

export function createSlipId():string {
  const bytes=new Uint8Array(16);
  (globalThis.crypto??(globalThis as {crypto?:Crypto}).crypto)?.getRandomValues?.(bytes);
  if(bytes.every(b=>b===0))for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function validSlipId(value:unknown):value is string {
  return typeof value==='string'&&/^[0-9a-f]{32}$/.test(value);
}

export function canonicalSelection(value:unknown,strict=false):CanonicalSelection|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(strict&&Object.keys(v).some(k=>!['fixturePublicId','scope','market','outcome','line'].includes(k)))return null;
  if(typeof v.fixturePublicId!=='string'||!/^[0-9a-f]{16}$/.test(v.fixturePublicId)||v.scope!==SLIP_SCOPE)return null;
  const base={fixturePublicId:v.fixturePublicId,scope:SLIP_SCOPE};
  if(v.market==='MATCH_WINNER'&&v.line===null&&(v.outcome==='HOME'||v.outcome==='DRAW'||v.outcome==='AWAY'))return {...base,market:v.market,outcome:v.outcome,line:null};
  if(v.market==='TOTAL_GOALS'&&v.line===2.5&&(v.outcome==='OVER'||v.outcome==='UNDER'))return {...base,market:v.market,outcome:v.outcome,line:2.5};
  if(v.market==='BTTS'&&v.line===null&&(v.outcome==='YES'||v.outcome==='NO'))return {...base,market:v.market,outcome:v.outcome,line:null};
  return null;
}

export function parseResolutionRequest(value:unknown):{locale:SiteLocale;selections:BoundSelection[]}|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['locale','selections'].includes(k))||!['br','mx','co','pe'].includes(String(v.locale))||!Array.isArray(v.selections)||v.selections.length>SLIP_LIMIT)return null;
  const selections=v.selections.map((s:unknown)=>{
    if(!s||typeof s!=='object'||Array.isArray(s))return null;
    const {receipt,...intent}=s as Record<string,unknown>;
    const canonical=canonicalSelection(intent,true);
    if(!canonical||receipt!==undefined&&(typeof receipt!=='string'||receipt.length>1600||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(receipt)))return null;
    return {...canonical,...(typeof receipt==='string'?{receipt}:{})};
  });
  if(selections.some(s=>s===null))return null;
  const valid=selections as BoundSelection[];
  if(new Set(valid.map(selectionKey)).size!==valid.length||new Set(valid.map(marketKey)).size!==valid.length)return null;
  return {locale:v.locale as SiteLocale,selections:valid};
}
