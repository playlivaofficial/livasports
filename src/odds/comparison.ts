import { KICKOFF_TOLERANCE_MS, SELECTIONS, type OddsComparison, type OddsMarket, type OddsReadSnapshot, type ReadOddsQuote, type OddsStatus } from './types';
import { freshnessTtlMs } from './scheduler-policy';

export function publicFeedCount(snapshot:OddsReadSnapshot):number {
  return new Set(snapshot.quotes.filter(q=>q.geoEligible).map(q=>q.bookmaker)).size;
}
export function quoteFreshnessTtlMs(quote:ReadOddsQuote,snapshot:OddsReadSnapshot,now:number):number {
  const close=Math.min(Date.parse(snapshot.kickoff),Date.parse(quote.providerKickoff));
  if(now>=close)return 0;
  if(quote.freshnessTtlMinutes!==null&&quote.freshnessTtlMinutes!==undefined)
    return Number.isFinite(quote.freshnessTtlMinutes)&&quote.freshnessTtlMinutes>0?quote.freshnessTtlMinutes*60000:0;
  return freshnessTtlMs((close-Date.parse(quote.observedAt))/3600000,publicFeedCount(snapshot));
}

export function quoteState(quote:ReadOddsQuote,snapshot:OddsReadSnapshot,now:number):OddsStatus {
  if(snapshot.fixtureStatus!=='SCHEDULED'||now>=Math.min(Date.parse(snapshot.kickoff),Date.parse(quote.providerKickoff)))return 'CLOSED';
  if(!Number.isFinite(Date.parse(snapshot.kickoff))||!Number.isFinite(Date.parse(quote.providerKickoff))||
    Math.abs(Date.parse(snapshot.kickoff)-Date.parse(quote.providerKickoff))>KICKOFF_TOLERANCE_MS)return 'CLOSED';
  if(quote.scope!=='FULL_TIME_REGULATION'||quote.phase!=='PREGAME')return 'CLOSED';
  if(quote.status!=='ACTIVE')return quote.status;
  const updated=Date.parse(quote.providerUpdatedAt??'');const observed=Date.parse(quote.observedAt);
  const refreshed=Date.parse(quote.lastSuccessfulRefreshAt);const ttl=quoteFreshnessTtlMs(quote,snapshot,now);
  if(!Number.isFinite(updated)||!Number.isFinite(observed)||!Number.isFinite(refreshed)||ttl<=0||observed>now+60000||updated>observed+60000||refreshed>now+60000||
    now-Math.min(observed,refreshed)>=ttl)return 'STALE';
  return 'ACTIVE';
}
export function buildComparison(snapshot:OddsReadSnapshot,market:OddsMarket,now=Date.now(),actions:Record<string,string>={}):OddsComparison {
  const relevant=snapshot.quotes.filter(q=>q.geoEligible&&q.market===market&&(market==='TOTAL_GOALS'?q.line===2.5:q.line===null));
  const result:OddsComparison={market,line:market==='TOTAL_GOALS'?2.5:null,rows:[],observedAt:null,providerUpdatedAt:null,expiresAt:null,eligiblePrices:0};
  const closeTimes=[snapshot.kickoff,...relevant.map(q=>q.providerKickoff)].map(Date.parse).filter(Number.isFinite);
  result.closesAt=closeTimes.length?new Date(Math.min(...closeTimes)).toISOString():null;
  for(const bookmaker of [...new Set(relevant.map(q=>q.bookmaker))].sort()) {
    const prices=relevant.filter(q=>q.bookmaker===bookmaker);
    const cells=SELECTIONS[market].map(outcome=>{
      const matches=prices.filter(q=>q.outcome===outcome);const q=matches[0];
      const state=matches.length===1?quoteState(q,snapshot,now):'UNAVAILABLE';
      const valid=q&&Number.isFinite(Number(q.decimalOdds))&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000;
      const ttl=q?quoteFreshnessTtlMs(q,snapshot,now):0;
      const expires=q?Math.min(Date.parse(q.observedAt)+ttl,Date.parse(q.lastSuccessfulRefreshAt)+ttl,Date.parse(snapshot.kickoff),Date.parse(q.providerKickoff)):NaN;
      return {outcome,decimalOdds:state==='ACTIVE'&&valid?q.decimalOdds:null,state:valid?state:'UNAVAILABLE' as const,best:false,
        expiresAt:Number.isFinite(expires)?new Date(expires).toISOString():null};
    });
    result.rows.push({bookmaker,name:prices[0].bookmakerName,cells,action:cells.some(c=>c.decimalOdds)?actions[bookmaker]??null:null});
  }
  for(const outcome of SELECTIONS[market]){
    const eligible=result.rows.flatMap(r=>r.cells.filter(c=>c.outcome===outcome&&c.decimalOdds!==null));
    if(eligible.length>=2){const best=Math.max(...eligible.map(c=>Number(c.decimalOdds)));eligible.forEach(c=>{c.best=Number(c.decimalOdds)===best;});}
    result.eligiblePrices+=eligible.length;
  }
  const observed=relevant.map(q=>q.observedAt).filter(s=>Number.isFinite(Date.parse(s))).sort();
  const updated=relevant.map(q=>q.providerUpdatedAt).filter((s):s is string=>!!s&&Number.isFinite(Date.parse(s))).sort();
  const expires=result.rows.flatMap(r=>r.cells.filter(c=>c.decimalOdds!==null).map(c=>c.expiresAt!)).sort();
  result.observedAt=observed.at(-1)??null;result.providerUpdatedAt=updated.at(-1)??null;result.expiresAt=expires[0]??null;
  return result;
}
