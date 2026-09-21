import type {QueryExecutor} from '@/database/client';
import {readListingOddsSnapshots} from './read-core';
import {buildComparison,quoteState} from './comparison';
import {BOOKMAKER_REGISTRY,VISIBLE_BOOKMAKERS} from './registry';
import {SELECTIONS,type OddsMarket,type OddsReadSnapshot} from './types';

export function summarizeFourSources(snapshots:readonly OddsReadSnapshot[],now:number){
  const sources=BOOKMAKER_REGISTRY.map(book=>({bookmaker:book.canonicalId,name:book.displayName,role:book.displayRole,fixtures:0,currentFixtures:0,staleOrSuspended:0,markets:{MATCH_WINNER:0,TOTAL_GOALS:0,BTTS:0}}));
  const targets=VISIBLE_BOOKMAKERS.map(book=>({bookmaker:book.canonicalId,real:0,proxy:0,unavailable:0,BETANO_INSURANCE_USED:0,BETANO_INSURANCE_FAILED:0,ALTERNATE_INSURANCE_USED:0,NO_INSURANCE_AVAILABLE:0}));
  const visibleReal={three:0,two:0,one:0,none:0};
  for(const snapshot of snapshots){
    let realBooks=0;
    for(const source of sources){
      const quotes=snapshot.quotes.filter(q=>q.bookmaker===source.bookmaker&&q.geoEligible);
      const fresh=quotes.filter(q=>quoteState(q,snapshot,now)==='ACTIVE'&&Number(q.decimalOdds)>1&&Number(q.decimalOdds)<=1000);
      if(quotes.length)source.fixtures++;
      if(fresh.length){source.currentFixtures++;if(source.role==='VISIBLE_PRIMARY')realBooks++;}
      source.staleOrSuspended+=quotes.length-fresh.length;
      for(const market of Object.keys(SELECTIONS) as OddsMarket[])if(SELECTIONS[market].every(outcome=>fresh.some(q=>q.market===market&&q.outcome===outcome&&(market==='TOTAL_GOALS'?q.line===2.5:q.line===null))))source.markets[market]++;
    }
    visibleReal[realBooks===3?'three':realBooks===2?'two':realBooks===1?'one':'none']++;
    for(const market of Object.keys(SELECTIONS) as OddsMarket[]){
      const comparison=buildComparison(snapshot,market,now);
      for(const target of targets){
        const row=comparison.rows.find(r=>r.bookmaker===target.bookmaker);
        for(const outcome of SELECTIONS[market]){
          const cell=row?.cells.find(c=>c.outcome===outcome);
          if(cell?.decimalOdds&&cell.priceKind==='REAL'){target.real++;continue;}
          if(cell?.decimalOdds&&cell.priceKind==='PROXY'){
            target.proxy++;
            if(cell.sourceBookmaker==='betano.bet.br')target.BETANO_INSURANCE_USED++;
            else{target.BETANO_INSURANCE_FAILED++;target.ALTERNATE_INSURANCE_USED++;}
          }else{target.unavailable++;target.BETANO_INSURANCE_FAILED++;target.NO_INSURANCE_AVAILABLE++;}
        }
      }
    }
  }
  const total=targets.reduce((n,t)=>n+t.real+t.proxy,0),proxy=targets.reduce((n,t)=>n+t.proxy,0);
  const bestVisible=Math.max(0,...sources.filter(s=>s.role==='VISIBLE_PRIMARY').map(s=>s.currentFixtures));
  const degraded=proxy>total*.8||sources.some(s=>s.role==='VISIBLE_PRIMARY'&&bestVisible>=5&&s.currentFixtures<bestVisible*.25);
  return {fixtures:snapshots.length,sources,targets,visibleReal,proxyPct:total?Math.round(proxy/total*1000)/10:0,degraded};
}
export type FourSourceHealth={at:string;providerRequests:0;windows:Record<'24h'|'3d'|'7d',ReturnType<typeof summarizeFourSources>>};
export async function readFourSourceHealth(db:QueryExecutor,now=new Date()):Promise<FourSourceHealth>{
  const {rows}=await db.query(`SELECT f.id FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.enabled
    WHERE f.status='SCHEDULED' AND f.kickoff>$1 AND f.kickoff<=$1::timestamptz+interval '7 days' ORDER BY f.kickoff`,[now.toISOString()]);
  const snapshots=await readListingOddsSnapshots(db,rows.map(r=>String(r.id)),null,true);
  const values=[...snapshots.values()];
  return {at:now.toISOString(),providerRequests:0,windows:Object.fromEntries(([['24h',24],['3d',72],['7d',168]] as const).map(([key,hours])=>[key,summarizeFourSources(values.filter(s=>Date.parse(s.kickoff)<=now.getTime()+hours*3600000),now.getTime())])) as FourSourceHealth['windows']};
}
