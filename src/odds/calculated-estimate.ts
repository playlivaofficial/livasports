import {CORE_GEOS} from '@/config/geo';
import {primaryVisibleBookmakers} from './fallback-pool';
import {validDecimalOdds} from '@/slip/decimal';
import type {CalculatedOddsEstimate,OddsCell,OddsMarket,OddsOutcome} from './types';

/** Only authorized local operators, in registry order; not a hard-coded two-column limit. */
export function comparisonBookmakers(ids:readonly string[]):readonly string[] {
  const unique=[...new Set(ids)];
  if(unique.length<2)return [];
  const matches=CORE_GEOS.map(primaryVisibleBookmakers).filter(pool=>unique.every(id=>pool.includes(id)));
  return matches.length===1?matches[0].filter(id=>unique.includes(id)):[];
}
/** Compatibility identity check for a source/target relationship. */
export function comparisonPair(ids:readonly string[]):readonly [string,string]|null {
  const books=comparisonBookmakers(ids);
  return ids.length===2&&books.length===2?[books[0],books[1]]:null;
}
/** Exact decimal multiplication, without floating point or a fabricated minimum-price clamp. */
export function minusTenPercent(value:string):string|null {
  if(!validDecimalOdds(value))return null;
  const [whole,fraction='']=value.split('.');const scale=fraction.length+1;
  const digits=String(BigInt(whole+fraction)*9n).padStart(scale+1,'0');
  return `${digits.slice(0,-scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/,'');
}
export function calculatedEstimate(input:{fixtureId:string;market:OddsMarket;outcome:OddsOutcome;line:number|null;target:string;sourceBookmaker:string;sourceName:string;source:OddsCell;now:number}):CalculatedOddsEstimate|null {
  const {source,now}=input;
  if(!input.fixtureId||!comparisonPair([input.sourceBookmaker,input.target])||source.priceKind!=='REAL'||source.state!=='ACTIVE'||
    source.outcome!==input.outcome||source.sourceBookmaker!==input.sourceBookmaker||!source.sourceQuoteId||!source.sourceObservedAt||
    !Number.isFinite(Date.parse(source.sourceObservedAt))||Date.parse(source.sourceObservedAt)>now+60000||
    !source.expiresAt||Date.parse(source.expiresAt)<=now||!Number.isFinite(Date.parse(source.expiresAt)))return null;
  const price=minusTenPercent(source.decimalOdds??'');if(!price)return null;
  return {kind:'CALCULATED_MINUS_10',fixtureId:input.fixtureId,market:input.market,outcome:input.outcome,line:input.line,
    scope:'FULL_TIME_REGULATION',targetBookmaker:input.target,sourceBookmaker:input.sourceBookmaker,sourceBookmakerName:input.sourceName,
    sourceDecimalOdds:source.decimalOdds!,decimalOdds:price,multiplier:'0.90',sourceObservedAt:source.sourceObservedAt,
    sourceQuoteId:source.sourceQuoteId,expiresAt:source.expiresAt,executable:false,affiliateEligible:false};
}
/** Client expiry/formula defense. Estimates never become candidates for this calculation. */
export function currentEstimate(estimate:CalculatedOddsEstimate|undefined,now:number):estimate is CalculatedOddsEstimate {
  return !!estimate&&estimate.kind==='CALCULATED_MINUS_10'&&estimate.executable===false&&estimate.affiliateEligible===false&&
    estimate.multiplier==='0.90'&&estimate.scope==='FULL_TIME_REGULATION'&&estimate.targetBookmaker!==estimate.sourceBookmaker&&
    !!comparisonPair([estimate.sourceBookmaker,estimate.targetBookmaker])&&
    Date.parse(estimate.expiresAt)>now&&Date.parse(estimate.sourceObservedAt)<=now+60000&&
    minusTenPercent(estimate.sourceDecimalOdds)===estimate.decimalOdds;
}
export function publicEstimate({sourceQuoteId:_private,...estimate}:CalculatedOddsEstimate):CalculatedOddsEstimate {
  void _private;return estimate;
}
export const estimateCopy={
  en:{short:'Estimate −10%',disclaimer:'Not a price offered by this bookmaker',source:'Based on',real:'Real bookmaker quote',actualReturn:'Potential return with real odds',indicativeReturn:'Indicative estimated return',indicativeCombined:'Indicative combined price',actualUnavailable:'Actual complete-slip return unavailable',notExecutable:'Comparison only · not executable',low:'Calculated factor below 1; not valid bookmaker odds'},
  br:{short:'Estimativa −10%',disclaimer:'Não é uma cotação oferecida por esta casa',source:'Baseada em',real:'Cotação real da casa',actualReturn:'Retorno potencial com odds reais',indicativeReturn:'Retorno estimado indicativo',indicativeCombined:'Cotação combinada indicativa',actualUnavailable:'Retorno real do cupom completo indisponível',notExecutable:'Somente comparação · não executável',low:'Fator calculado abaixo de 1; não é uma odd válida'},
  es:{short:'Estimación −10%',disclaimer:'No es una cuota ofrecida por esta casa',source:'Basada en',real:'Cuota real de la casa',actualReturn:'Retorno potencial con cuotas reales',indicativeReturn:'Retorno estimado indicativo',indicativeCombined:'Cuota combinada indicativa',actualUnavailable:'Retorno real del cupón completo no disponible',notExecutable:'Solo comparación · no ejecutable',low:'Factor calculado inferior a 1; no es una cuota válida'},
};
export function estimateLabels(locale:string){return locale==='en'?estimateCopy.en:locale==='br'?estimateCopy.br:estimateCopy.es;}
