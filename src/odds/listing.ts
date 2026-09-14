import type {QueryExecutor} from '@/database/client';
import type {FixtureView,M2PageData,MarketOddsView} from '@/delivery/types';
import {FixtureStatus,MarketCode,OutcomeCode} from '@/domain/enums';
import {buildComparison} from './comparison';
import {readListingOddsSnapshots} from './read-repository';
import {SELECTIONS,type OddsReadSnapshot} from './types';
import type {CommercialGeo} from './commercial-geo';

function listingBookmaker(slug:string,name:string):'Betano BR'|'Betsson'|null {
  if(slug==='betano.bet.br'||name==='Betano BR')return 'Betano BR';
  if(slug==='betsson'||name==='Betsson')return 'Betsson';
  return null;
}

export function listingMatchWinnerOdds(snapshot:OddsReadSnapshot,now=Date.now()):Pick<FixtureView,'odds'|'oddsState'> {
  const comparison=buildComparison(snapshot,'MATCH_WINNER',now);
  const outcomes:MarketOddsView['outcomes']=SELECTIONS.MATCH_WINNER.map(outcome=>({
    outcome:outcome as OutcomeCode,
    prices:comparison.rows.flatMap(row=>{
      const cell=row.cells.find(item=>item.outcome===outcome);
      const bookmaker=listingBookmaker(row.bookmaker,row.name);
      if(!cell||cell.state!=='ACTIVE'||!cell.decimalOdds||!bookmaker)return [];
      const decimalOdds=Number(cell.decimalOdds);
      if(!Number.isFinite(decimalOdds))return [];
      return [{bookmaker,decimalOdds,providerUpdatedAt:comparison.providerUpdatedAt??cell.expiresAt??'',freshness:'fresh' as const,...(cell.expiresAt?{expiresAt:cell.expiresAt}:{})}];
    }),
  }));
  const odds:MarketOddsView[]=outcomes.some(outcome=>outcome.prices.length)
    ?[{market:MarketCode.MATCH_WINNER,line:null,outcomes}]:[];
  const activeBooks=new Set(outcomes.flatMap(outcome=>outcome.prices.map(price=>price.bookmaker)));
  const stale=comparison.rows.some(row=>row.cells.some(cell=>cell.state==='STALE'));
  const oddsState=activeBooks.size>=2?'complete':activeBooks.size===1?'partial':stale?'stale':'none';
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
