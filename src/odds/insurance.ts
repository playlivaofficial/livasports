import {bookmakerConfig,BOOKMAKER_REGISTRY} from './registry';
import {compareDecimal,validDecimalOdds} from '@/slip/decimal';

export type InsuranceResolution='OWN_REAL'|'BETANO_INSURANCE_USED'|'ALTERNATE_INSURANCE_USED'|'NO_INSURANCE_AVAILABLE';
export interface InsuranceCandidate<T> {bookmaker:string;priceKind:'REAL'|'PROXY'|null;current:boolean;decimalOdds:string|null;value:T;}
/** Inputs must already be scoped to ONE exact fixture/market/outcome/line and freshness-checked.
 * Only native quotes are candidates. This pure resolver never mutates/persists a displayed proxy. */
export function resolveInsurance<T>(target:string,candidates:readonly InsuranceCandidate<T>[]):{candidate:InsuranceCandidate<T>|null;resolution:InsuranceResolution;preferredInsuranceFailed:boolean} {
  const real=candidates.filter(c=>c.current&&c.priceKind==='REAL'&&validDecimalOdds(c.decimalOdds??'')&&bookmakerConfig(c.bookmaker));
  const own=real.find(c=>c.bookmaker===target);
  if(own)return {candidate:own,resolution:'OWN_REAL',preferredInsuranceFailed:false};
  const hidden=real.filter(c=>bookmakerConfig(c.bookmaker)?.displayRole==='HIDDEN_INSURANCE')
    .sort((a,b)=>bookmakerConfig(a.bookmaker)!.insurancePriority-bookmakerConfig(b.bookmaker)!.insurancePriority)[0];
  if(hidden)return {candidate:hidden,resolution:'BETANO_INSURANCE_USED',preferredInsuranceFailed:false};
  const alternate=real.filter(c=>c.bookmaker!==target&&bookmakerConfig(c.bookmaker)?.displayRole==='VISIBLE_PRIMARY')
    .sort((a,b)=>compareDecimal(a.decimalOdds!,b.decimalOdds!)||bookmakerConfig(a.bookmaker)!.insurancePriority-bookmakerConfig(b.bookmaker)!.insurancePriority)[0];
  return {candidate:alternate??null,resolution:alternate?'ALTERNATE_INSURANCE_USED':'NO_INSURANCE_AVAILABLE',
    preferredInsuranceFailed:BOOKMAKER_REGISTRY.some(b=>b.displayRole==='HIDDEN_INSURANCE')};
}
