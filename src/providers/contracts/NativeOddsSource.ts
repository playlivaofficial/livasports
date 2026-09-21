import type {OddsMarket,OddsOutcome,OddsStatus} from '@/odds/types';

export type NativeOddsSourceId=string;
export interface NativeSourceFixtureIdentity {providerFixtureId:string;canonicalFixtureId:string;mappingVerified:boolean;}
export interface NativeSourceQuote {
  sourceProvider:NativeOddsSourceId;providerQuoteId?:string;fixture:NativeSourceFixtureIdentity;
  bookmaker:string;providerBookmakerId:string;market:OddsMarket;providerMarketId:string;outcome:OddsOutcome;line:number|null;
  decimalOdds:string;status:OddsStatus;providerUpdatedAt:string|null;observedAt:string;providerKickoff:string;
  freshnessTtlMinutes:number;sourceDomain:string|null;confidence:'VERIFIED'|'HIGH'|'MEDIUM'|'LOW';metadata?:Record<string,unknown>;
}
export interface NativeOddsSourceRequest {bookmaker:string;canonicalTournamentIds:readonly string[];providerTournamentIds:readonly string[];}
export interface NativeOddsSourceBatch {sourceProvider:NativeOddsSourceId;observedAt:string;quotes:NativeSourceQuote[];requestCount:number;}

/** Server-only boundary. Implementations own provider identity/market mapping; public code sees canonical quotes only. */
export interface NativeOddsSource {
  readonly id:NativeOddsSourceId;
  readonly priority:number;
  fetchPregame(request:NativeOddsSourceRequest):Promise<NativeOddsSourceBatch>;
}

export function validateNativeSourceBatch(batch:NativeOddsSourceBatch){
  if(!batch.sourceProvider||!Number.isInteger(batch.requestCount)||batch.requestCount<0)throw new Error('INVALID_NATIVE_SOURCE_BATCH');
  for(const quote of batch.quotes){
    if(quote.sourceProvider!==batch.sourceProvider||!quote.fixture.mappingVerified||!quote.fixture.canonicalFixtureId||!quote.providerBookmakerId)throw new Error('UNVERIFIED_NATIVE_SOURCE_IDENTITY');
    if(!Number.isFinite(Number(quote.decimalOdds))||Number(quote.decimalOdds)<=1||!Number.isFinite(Date.parse(quote.observedAt))||quote.freshnessTtlMinutes<=0)throw new Error('INVALID_NATIVE_SOURCE_QUOTE');
  }
  return batch;
}
