import {guardResolved} from './resolution';
import {multiplyDecimalOdds} from './decimal';
import type {ResolvedSelection} from './types';
/** Separate planning estimate, never passed to bookmaker totals, signed offers, or return claims. */
export function indicativeCombined(values:readonly ResolvedSelection[],now:number):string|null {
 const current=values.map(v=>guardResolved(v,now));
 if(current.length<2||new Set(current.map(v=>v.selection.fixturePublicId)).size!==current.length||
   !current.some(v=>v.coverage==='INDICATIVE')||current.some(v=>!v.price))return null;
 return multiplyDecimalOdds(current.map(v=>v.price!.decimalOdds));
}
