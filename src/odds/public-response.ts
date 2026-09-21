import type {OddsComparison} from './types';

/**
 * Public/browser odds carry target identity and price classification only.
 * Supplier/fallback identity and quote IDs stay on the server/owner boundary.
 */
export function publicOddsComparisons(values:readonly OddsComparison[]):OddsComparison[]{
  return values.map(comparison=>({...comparison,rows:comparison.rows.map(row=>({...row,cells:row.cells.map(cell=>{
    const safe={...cell} as Partial<typeof cell>;
    delete safe.sourceBookmaker;delete safe.sourceBookmakerName;delete safe.sourceQuoteId;delete safe.sourceObservedAt;
    return safe;
  })}))})) as OddsComparison[];
}
