import type {SiteLocale} from '@/config/i18n';

export const SLIP_LIMIT = 10;
export const SLIP_SCOPE = 'FULL_TIME_REGULATION' as const;
export type CanonicalSelection = {fixturePublicId:string;scope:typeof SLIP_SCOPE} & (
  {market:'MATCH_WINNER';outcome:'HOME'|'DRAW'|'AWAY';line:null} |
  {market:'TOTAL_GOALS';outcome:'OVER'|'UNDER';line:2.5} |
  {market:'BTTS';outcome:'YES'|'NO';line:null}
);
export type SavedSelection = CanonicalSelection & {addedAt:string};
export interface StoredSlip {version:1;selections:SavedSelection[];}
export type SelectionState = 'CURRENT'|'PRICE_CHANGED'|'STALE'|'UNAVAILABLE'|'SUSPENDED'|'CLOSED'|'MATCH_STARTED'|'MATCH_FINISHED';
export interface ReferencePrice {decimalOdds:string;bookmaker:string;bookmakerName:string;best:boolean;expiresAt:string;}
export interface ResolvedSelection {
  selection:CanonicalSelection;
  fixture:{publicId:string;home:string;away:string;competition:string;kickoff:string;status:string}|null;
  state:SelectionState;
  reason:'NO_VERIFIED_GEO'|'MISSING_FIXTURE'|'NO_QUOTE'|null;
  price:ReferencePrice|null;
  closesAt:string|null;
}
export interface SlipResolution {locale:SiteLocale;resolvedAt:string;selections:ResolvedSelection[];providerRequests:0;}

// M7 may consume this exact identity; neither bookmaker nor kickoff defines a selection.
export function selectionKey(s:CanonicalSelection):string {
  return `${s.fixturePublicId}:${s.scope}:${s.market}:${s.outcome}:${s.line??'none'}`;
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

export function parseResolutionRequest(value:unknown):{locale:SiteLocale;selections:CanonicalSelection[]}|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['locale','selections'].includes(k))||(v.locale!=='br'&&v.locale!=='mx')||!Array.isArray(v.selections)||v.selections.length>SLIP_LIMIT)return null;
  const selections=v.selections.map(s=>canonicalSelection(s,true));
  if(selections.some(s=>s===null))return null;
  const valid=selections as CanonicalSelection[];
  if(new Set(valid.map(s=>s.fixturePublicId)).size!==valid.length)return null;
  return {locale:v.locale,selections:valid};
}
