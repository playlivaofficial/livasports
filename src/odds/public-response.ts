import type {OddsComparison} from './types';
import {publicEstimate} from './calculated-estimate';

/**
 * Public/browser odds carry target identity and price classification only.
 * Native-cell internal identity and quote IDs stay on the server/owner boundary.
 * Separate indicative estimates intentionally retain public bookmaker attribution,
 * source price and observation time, but never the internal quote ID.
 */
export function publicOddsComparisons(values:readonly OddsComparison[]):OddsComparison[]{
  return values.map(comparison=>({...comparison,...(comparison.estimates?{estimates:comparison.estimates.map(publicEstimate)}:{}),rows:comparison.rows.map(row=>({...row,cells:row.cells.map(cell=>{
    const safe={...cell} as Partial<typeof cell>;
    delete safe.sourceBookmaker;delete safe.sourceBookmakerName;delete safe.sourceQuoteId;delete safe.sourceObservedAt;
    return safe;
  })}))})) as OddsComparison[];
}
