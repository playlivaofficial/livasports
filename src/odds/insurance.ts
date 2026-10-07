import {bookmakerConfig,BOOKMAKER_REGISTRY,isRetiredBookmaker} from './registry';
import {validDecimalOdds} from '@/slip/decimal';

/**
 * How one bookmaker's exact selection was priced.
 *
 * OWN_REAL                the bookmaker's own fresh price.
 * HIDDEN_INSURANCE_USED   a source holding the dedicated HIDDEN_INSURANCE role supplied the price. No
 *                         operator holds that role after the MX/CO/PE cutover, so this is dormant.
 * NO_INSURANCE_AVAILABLE  nothing eligible priced it, so the slot stays truthfully unavailable.
 *
 * There is deliberately no cross-primary resolution. One visible book's price is never moved into
 * another visible book's row, because that presents bookmaker B's price as bookmaker A's actual price.
 * Continuity when a primary book has no price is served instead by an explicitly attributed
 * FALLBACK_REFERENCE row, configured per jurisdiction in `./fallback-pool`.
 */
export type InsuranceResolution='OWN_REAL'|'HIDDEN_INSURANCE_USED'|'NO_INSURANCE_AVAILABLE';
export interface InsuranceCandidate<T> {bookmaker:string;priceKind:'REAL'|'PROXY'|null;current:boolean;decimalOdds:string|null;value:T;}
/** Inputs must already be scoped to ONE exact fixture/market/outcome/line and freshness-checked.
 * Only native quotes are candidates. This pure resolver never mutates/persists a displayed proxy. */
export function resolveInsurance<T>(target:string,candidates:readonly InsuranceCandidate<T>[]):{candidate:InsuranceCandidate<T>|null;resolution:InsuranceResolution;preferredInsuranceFailed:boolean} {
  // A retired operator is never comparable, so it cannot be a source even for its own row.
  const real=candidates.filter(c=>c.current&&c.priceKind==='REAL'&&validDecimalOdds(c.decimalOdds??'')&&bookmakerConfig(c.bookmaker)&&!isRetiredBookmaker(c.bookmaker));
  const own=real.find(c=>c.bookmaker===target);
  if(own)return {candidate:own,resolution:'OWN_REAL',preferredInsuranceFailed:false};
  // Only a source explicitly held out as insurance may stand in for a target row, and it is hidden
  // precisely because it is not a public card competing inside the same comparison.
  const hidden=real.filter(c=>bookmakerConfig(c.bookmaker)?.displayRole==='HIDDEN_INSURANCE')
    .sort((a,b)=>bookmakerConfig(a.bookmaker)!.insurancePriority-bookmakerConfig(b.bookmaker)!.insurancePriority)[0];
  if(hidden)return {candidate:hidden,resolution:'HIDDEN_INSURANCE_USED',preferredInsuranceFailed:false};
  // No substitution from another visible primary. The caller leaves the slot unavailable, and the
  // jurisdiction's configured reference pool, if any, supplies continuity under its own identity.
  return {candidate:null,resolution:'NO_INSURANCE_AVAILABLE',
    preferredInsuranceFailed:BOOKMAKER_REGISTRY.some(b=>b.displayRole==='HIDDEN_INSURANCE')};
}
