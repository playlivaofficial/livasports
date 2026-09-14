import {buildComparison} from '@/odds/comparison';
import type {OddsReadSnapshot} from '@/odds/types';
import type {CanonicalSelection,ResolvedSelection} from './types';

export interface SlipFixtureRead {fixture:NonNullable<ResolvedSelection['fixture']>;snapshot:OddsReadSnapshot;}
export function resolveSelection(selection:CanonicalSelection,read:SlipFixtureRead|null,now=Date.now()):ResolvedSelection {
  const result:ResolvedSelection={selection,fixture:read?.fixture??null,state:'UNAVAILABLE',reason:read?'NO_QUOTE':'MISSING_FIXTURE',price:null,closesAt:read?.fixture.kickoff??null};
  if(!read)return result;
  const {fixture,snapshot}=read;
  if(fixture.status==='FINISHED')return {...result,state:'MATCH_FINISHED',reason:null};
  if(['LIVE','HALFTIME'].includes(fixture.status))return {...result,state:'MATCH_STARTED',reason:null};
  if(fixture.status!=='SCHEDULED')return {...result,state:'CLOSED',reason:null};
  if(!Number.isFinite(Date.parse(fixture.kickoff)))return result;
  if(now>=Date.parse(fixture.kickoff))return {...result,state:'MATCH_STARTED',reason:null};
  const comparison=buildComparison(snapshot,selection.market,now);
  const candidates=comparison.rows.flatMap(row=>row.cells.filter(c=>c.outcome===selection.outcome).map(cell=>({row,cell})));
  const active=candidates.filter(c=>c.cell.decimalOdds!==null&&c.cell.expiresAt!==null).sort((a,b)=>Number(b.cell.decimalOdds)-Number(a.cell.decimalOdds)||a.row.bookmaker.localeCompare(b.row.bookmaker));
  const first=active[0];
  if(first)return {...result,state:'CURRENT',reason:null,closesAt:comparison.closesAt??fixture.kickoff,price:{
    decimalOdds:first.cell.decimalOdds!,bookmaker:first.row.bookmaker,bookmakerName:first.row.name,best:first.cell.best&&active.length>=2,expiresAt:first.cell.expiresAt!}};
  if(!comparison.rows.length)return {...result,reason:snapshot.quotes.length?'NO_VERIFIED_GEO':'NO_QUOTE'};
  const state=candidates.some(c=>c.cell.state==='STALE')?'STALE':candidates.some(c=>c.cell.state==='SUSPENDED')?'SUSPENDED':
    candidates.some(c=>c.cell.state==='CLOSED')?'CLOSED':'UNAVAILABLE';
  return {...result,state,closesAt:comparison.closesAt??fixture.kickoff};
}

// Render-time guard also protects already-open/offline tabs; it never extends a server expiry.
export function guardResolved(value:ResolvedSelection,now:number,connected=true):ResolvedSelection {
  if(value.state==='MATCH_FINISHED')return {...value,price:null};
  if(value.fixture?.status==='SCHEDULED'&&value.closesAt&&now>=Date.parse(value.closesAt))return {...value,state:'MATCH_STARTED',price:null};
  if(!['CURRENT','PRICE_CHANGED'].includes(value.state))return {...value,price:null};
  if(value.price&&(!connected||!Number.isFinite(Date.parse(value.price.expiresAt))||now>=Date.parse(value.price.expiresAt)))return {...value,state:'STALE',price:null};
  if(value.price&&(!Number.isFinite(Number(value.price.decimalOdds))||Number(value.price.decimalOdds)<=1||Number(value.price.decimalOdds)>1000))return {...value,state:'UNAVAILABLE',price:null};
  return value;
}

export function markPriceChange(next:ResolvedSelection,previousPrice:string|undefined):ResolvedSelection {
  return next.state==='CURRENT'&&next.price&&previousPrice!==undefined&&Number(next.price.decimalOdds)!==Number(previousPrice)
    ?{...next,state:'PRICE_CHANGED',previousDecimalOdds:previousPrice}:next;
}
