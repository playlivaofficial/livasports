import type {IndicativeQuote} from '@/odds/types';
import type {SlipUiLocale} from '@/slip/localization';
import {ApproximatePrice} from './ApproximatePrice';

/** One informational grid cell. Never a local bookmaker offer, button, or affiliate link. */
export function ReferenceOdds({quote,uiLocale}:{quote:IndicativeQuote;uiLocale:SlipUiLocale}){
 const label=uiLocale==='br'?'Referência':uiLocale==='en'?'Reference':'Referencia';
 const disclaimer=uiLocale==='br'?'Somente informação. Não é uma oferta para apostar.':uiLocale==='en'?'Information only. Not an executable betting offer.':'Solo información. No es una oferta para apostar.';
 const attribution=`${quote.bookmakerName} · ${quote.sourceGeo} · ${quote.sourceDomain} · ${quote.observedAt}`;
 return <span className="odds-reference-cell" role="note" title={`${disclaimer} ${attribution}`}
   data-reference-outcome={quote.outcome} data-reference-market={quote.market} data-reference-source={quote.bookmaker}>
   <ApproximatePrice className="odds-reference-price" value={Number(quote.decimalOdds).toFixed(2)} label={label}/>
   <small>{quote.bookmakerName} · {label}</small>
   <span className="sr-only">{disclaimer} {attribution}</span>
 </span>;
}
