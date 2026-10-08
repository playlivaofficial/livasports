import type {FullSlipResolution,SelectionQuote} from './comparison-types';
import type {ResolvedSelection,SlipResolution} from './types';

function publicSelection(value:ResolvedSelection):ResolvedSelection {
  if(!value.price)return value;
  const price={...value.price};
  if(price.priceKind==='INDICATIVE')return {...value,price};
  delete price.sourceBookmaker;delete price.sourceQuoteId;delete price.sourceObservedAt;
  return {...value,price};
}

function publicQuote(value:SelectionQuote):SelectionQuote {
  const quote={...value} as Partial<SelectionQuote>;
  delete quote.sourceBookmakerId;delete quote.sourceBookmakerName;delete quote.sourceQuoteId;delete quote.sourceObservedAt;
  return quote as SelectionQuote;
}

/** Keep fallback provenance server-side while preserving the public price state. */
export function publicSlipResolution<T extends SlipResolution>(value:T):T {
  if(!Array.isArray(value.selections))return value;
  const result={...value,selections:value.selections.map(publicSelection)} as T;
  if(!('comparison' in result))return result;
  const full=result as unknown as FullSlipResolution;
  return {...full,comparison:{...full.comparison,bookmakers:full.comparison.bookmakers.map(bookmaker=>({...bookmaker,
    selectionQuotes:bookmaker.selectionQuotes.map(publicQuote),
    missingSelections:bookmaker.missingSelections.map(publicQuote),
    invalidSelections:bookmaker.invalidSelections.map(publicQuote),
  }))}} as unknown as T;
}
