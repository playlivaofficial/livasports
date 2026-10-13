import type {CalculatedOddsEstimate} from '@/odds/types';
import {estimateLabels} from '@/odds/calculated-estimate';
import type {GeoLocale} from '@/config/geo';
import {formatSlipOdds} from '@/slip/decimal';
import {ApproximatePrice} from './ApproximatePrice';

/** Indicative price display: may sit in a planning-selection button, never an executable offer. */
export function CalculatedPrice({estimate,locale}:{estimate:CalculatedOddsEstimate;locale:GeoLocale}){
  const text=estimateLabels(locale);
  const provenance=`${text.source} ${estimate.sourceBookmakerName}: ${estimate.sourceDecimalOdds} × 0.90 · ${estimate.sourceObservedAt}`;
  const low=Number(estimate.decimalOdds)<1?` · ${text.low}`:'';
  return <span className="calculated-price" data-price-kind="CALCULATED_MINUS_10" data-source-bookmaker={estimate.sourceBookmaker}
    title={`${text.short} · ${text.disclaimer}. ${provenance}${low}`}>
    <ApproximatePrice value={formatSlipOdds(estimate.decimalOdds,locale)??'—'} label={`${text.short}. ${text.disclaimer}`}/>
    <span className="sr-only">{provenance}{low}</span>
  </span>;
}
