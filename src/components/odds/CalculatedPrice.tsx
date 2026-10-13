import type {CalculatedOddsEstimate} from '@/odds/types';
import {estimateLabels} from '@/odds/calculated-estimate';
import type {GeoLocale} from '@/config/geo';
import {formatSlipOdds} from '@/slip/decimal';
import {ApproximatePrice} from './ApproximatePrice';

/** Informational text only: never a button, selection intent, or affiliate destination. */
export function CalculatedPrice({estimate,locale}:{estimate:CalculatedOddsEstimate;locale:GeoLocale}){
  const text=estimateLabels(locale);
  const provenance=`${text.source} ${estimate.sourceBookmakerName}: ${estimate.sourceDecimalOdds} × 0.90 · ${estimate.sourceObservedAt}`;
  return <span className="calculated-price" data-price-kind="CALCULATED_MINUS_10" data-source-bookmaker={estimate.sourceBookmaker}
    title={`${text.short} · ${text.disclaimer}. ${provenance}`}>
    <ApproximatePrice value={formatSlipOdds(estimate.decimalOdds,locale)??'—'} label={`${text.short}. ${text.disclaimer}`}/>
    <small>−10%</small><span className="sr-only">{provenance}</span>
    {Number(estimate.decimalOdds)<1?<span className="calculated-low-factor">{text.low}</span>:null}
  </span>;
}
export function EstimateDisclaimer({locale,source}:{locale:GeoLocale;source?:string}){
  const text=estimateLabels(locale);
  return <p className="odds-estimate-disclaimer">{text.short} · {text.disclaimer}{source?<> · {text.source} {source}</>:null}</p>;
}
