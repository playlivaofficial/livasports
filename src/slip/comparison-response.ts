import type {SiteLocale} from '@/config/i18n';
import {VISIBLE_BOOKMAKERS,isVisibleBookmaker} from '@/odds/registry';
import type {SlipComparison} from './comparison-types';
import {canonicalSelection,selectionKey,type CanonicalSelection} from './types';

/** Shared browser response boundary; public cards must be unique configured visible targets. */
export function validComparisonResponse(comparison:SlipComparison,locale:SiteLocale,selections:readonly CanonicalSelection[]):boolean{
  try{return comparison.version===1&&comparison.locale===locale&&Array.isArray(comparison.bookmakers)&&
    comparison.bookmakers.length<=VISIBLE_BOOKMAKERS.length&&new Set(comparison.bookmakers.map(b=>b.bookmakerId)).size===comparison.bookmakers.length&&
    comparison.bookmakers.every(b=>isVisibleBookmaker(b.bookmakerId)&&(b.geoEligibility.locale==='br'||b.geoEligibility.locale==='mx')&&
      Array.isArray(b.selectionQuotes)&&b.selectionQuotes.length===selections.length&&
      b.selectionQuotes.every((q,i)=>canonicalSelection(q.selection,true)&&selectionKey(q.selection)===selectionKey(selections[i])));
  }catch{return false;}
}
