import {quoteState,selectNativeMarketQuotes} from '@/odds/comparison';
import {isVisibleBookmaker} from '@/odds/registry';
import type {OddsReadSnapshot,OddsOutcome,ReadOddsQuote} from '@/odds/types';
import type {GrowthOddsBookmaker} from './types';

export interface PublicBookmakerSummary {bookmakers:GrowthOddsBookmaker[];priceGap:number|null;}

/**
 * Marketing is stricter than internal pricing. Only a visible bookmaker's own current REAL quote may
 * authorize its public name. Hidden insurance and supplier/native provenance never cross this boundary.
 */
export function publicBookmakerSummary(snapshot:OddsReadSnapshot,now=Date.now()):PublicBookmakerSummary{
  const byBookmaker=new Map<string,ReadOddsQuote[]>();
  for(const quote of snapshot.quotes){
    if(!quote.geoEligible||!isVisibleBookmaker(quote.bookmaker)||quoteState(quote,snapshot,now)!=='ACTIVE')continue;
    const rows=byBookmaker.get(quote.bookmaker)??[];rows.push(quote);byBookmaker.set(quote.bookmaker,rows);
  }
  const eligible:GrowthOddsBookmaker[]=[];const prices=new Map<OddsOutcome,number[]>();
  for(const [bookmaker,rows] of byBookmaker){
    const selected=selectNativeMarketQuotes(rows,'MATCH_WINNER',snapshot,now);
    if(selected.ambiguous||selected.size===0)continue;
    eligible.push({slug:bookmaker,name:rows[0].bookmakerName});
    for(const [outcome,quote] of selected){const values=prices.get(outcome)??[];values.push(Number(quote.decimalOdds));prices.set(outcome,values);}
  }
  eligible.sort((a,b)=>a.slug.localeCompare(b.slug));
  const spreads=[...prices.values()].filter(values=>values.length>=2).map(values=>Math.max(...values)-Math.min(...values));
  return {bookmakers:eligible,priceGap:spreads.length?Math.round(Math.max(...spreads)*100)/100:null};
}

export function publicBookmakerCopy(summary:PublicBookmakerSummary){
  if(summary.bookmakers.length<2)return 'Compare as odds no LivaSports.';
  if(summary.priceGap!==null&&summary.priceGap>=0.18)return 'As casas exibem preços diferentes para o mesmo mercado. Compare antes de montar seu bilhete.';
  return 'Compare os preços disponíveis antes de montar seu bilhete.';
}
