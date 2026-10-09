import type {IndicativeQuote,OddsMarket,OddsOutcome} from './types';

/** Shared by the fallback section and its parent: an expired array is not coverage. */
export function currentReferences(quotes:readonly IndicativeQuote[]|undefined,now:number){
  return (quotes??[]).filter(q=>q.kind==='INDICATIVE'&&q.executable===false&&q.affiliateEligible===false&&
    Number.isFinite(Number(q.decimalOdds))&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000&&Date.parse(q.expiresAt)>now);
}
/** Defensive client recheck: cached references must not duplicate a fresh local outcome. */
export function referencesForGaps(quotes:readonly IndicativeQuote[]|undefined,now:number,market:OddsMarket,line:number|null,covered:readonly OddsOutcome[]){
  const seen=new Set<OddsOutcome>(covered);
  return currentReferences(quotes,now).filter(q=>{
    if(q.market!==market||q.line!==line||q.scope!=='FULL_TIME_REGULATION'||q.phase!=='PREGAME'||seen.has(q.outcome))return false;
    seen.add(q.outcome);return true;
  });
}
export function unavailableOddsLabel(locale:string){
  return locale==='br'?'Cotação indisponível':locale==='en'?'Odds unavailable':'Cuota no disponible';
}
