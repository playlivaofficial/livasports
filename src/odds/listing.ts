import type {QueryExecutor} from '@/database/client';
import type {FixtureView,M2PageData,MarketOddsView} from '@/delivery/types';
import {FixtureStatus,MarketCode,OutcomeCode} from '@/domain/enums';
import {buildComparison,quoteState} from './comparison';
import {readListingOddsSnapshots} from './read-repository';
import {SELECTIONS,type OddsReadSnapshot} from './types';
import type {CommercialGeo} from './commercial-geo';
import {isVisibleBookmaker} from './registry';

export function listingMatchWinnerOdds(snapshot:OddsReadSnapshot,now=Date.now()):Pick<FixtureView,'odds'|'oddsState'> {
  const comparison=buildComparison(snapshot,'MATCH_WINNER',now);
  const outcomes:MarketOddsView['outcomes']=SELECTIONS.MATCH_WINNER.map(outcome=>({
    outcome:outcome as OutcomeCode,
    prices:comparison.rows.flatMap(row=>{
      const cell=row.cells.find(item=>item.outcome===outcome);
      const bookmaker=isVisibleBookmaker(row.bookmaker)?row.name:null;
      if(!cell||cell.state!=='ACTIVE'||!cell.decimalOdds||!bookmaker)return [];
      const decimalOdds=Number(cell.decimalOdds);
      if(!Number.isFinite(decimalOdds))return [];
      return [{bookmaker,decimalOdds,providerUpdatedAt:cell.sourceObservedAt??comparison.providerUpdatedAt??cell.expiresAt??'',freshness:'fresh' as const,
        priceKind:cell.priceKind??undefined,targetBookmaker:cell.targetBookmaker,
        ...(cell.expiresAt?{expiresAt:cell.expiresAt}:{})}];
    }),
  }));
  const odds:MarketOddsView[]=outcomes.some(outcome=>outcome.prices.length)
    ?[{market:MarketCode.MATCH_WINNER,line:null,outcomes}]:[];
  const activeBooks=new Set(outcomes.flatMap(outcome=>outcome.prices.map(price=>price.bookmaker)));
  const stale=snapshot.quotes.some(q=>q.geoEligible&&q.market==='MATCH_WINNER'&&quoteState(q,snapshot,now)==='STALE');
  const complete=comparison.rows.length>0&&comparison.rows.every(row=>row.cells.every(cell=>cell.state==='ACTIVE'&&cell.decimalOdds!==null));
  const oddsState=complete?'complete':activeBooks.size>0?'partial':stale?'stale':'none';
  return {odds,oddsState};
}

export async function attachListingOdds(db:QueryExecutor,page:M2PageData,now=Date.now(),geo:CommercialGeo|null=null):Promise<M2PageData> {
  const fixtures=page.sections.flatMap(section=>section.fixtures);
  const scheduledIds=[...new Set(fixtures.filter(fixture=>fixture.status===FixtureStatus.SCHEDULED).map(fixture=>fixture.id))];
  if(!scheduledIds.length)return {...page,paidOddsRequests:0};
  const snapshots=await readListingOddsSnapshots(db,scheduledIds,geo);
  let freshFixtures=0;let partial=false;
  const sections=page.sections.map(section=>({
    ...section,
    fixtures:section.fixtures.map(fixture=>{
      const snapshot=snapshots.get(fixture.id);
      if(!snapshot||fixture.status!==FixtureStatus.SCHEDULED)return fixture;
      const attached=listingMatchWinnerOdds(snapshot,now);
      if(attached.oddsState==='complete'||attached.oddsState==='partial')freshFixtures++;
      if(attached.oddsState==='partial')partial=true;
      return {...fixture,...attached};
    }),
  }));
  return {
    ...page,sections,paidOddsRequests:0,
    oddsData:freshFixtures
      ?{state:partial?'partial':'available',freshness:'fresh',reason:'ok'}
      :{state:'available',freshness:'unavailable',reason:'no-data'},
  };
}
