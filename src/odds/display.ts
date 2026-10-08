import type {IndicativeQuote} from './types';

/** Shared by the fallback section and its parent: an expired array is not coverage. */
export function currentReferences(quotes:readonly IndicativeQuote[]|undefined,now:number){
  return (quotes??[]).filter(q=>q.kind==='INDICATIVE'&&q.executable===false&&q.affiliateEligible===false&&
    Number.isFinite(Number(q.decimalOdds))&&Number(q.decimalOdds)>1&&Date.parse(q.expiresAt)>now);
}
export function unavailableOddsLabel(locale:string){
  return locale==='br'?'Cotação indisponível':locale==='en'?'Odds unavailable':'Cuota no disponible';
}
