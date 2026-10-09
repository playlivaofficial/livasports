import {describe,it,expect} from 'vitest';
import evidence from './fixtures/p0-missing-production-20261008.json';
import {buildComparison,selectIndicativeQuote} from './comparison';
import {primaryVisibleBookmakers} from './fallback-pool';
import {matchOddsFixture} from './matching';
import {publicOddsComparisons} from './public-response';
import {bookmakerConfig} from './registry';
import type {CoreGeo} from '@/config/geo';
import type {CanonicalOddsFixture,OddsReadSnapshot,ProviderOddsFixture,ReadOddsQuote} from './types';

// Immutable, credential-free production observations. No synthetic prices or refreshed timestamps.
const now=Date.parse(evidence.at);
function snapshot(row:typeof evidence.fixtures[number]):OddsReadSnapshot {
 const references=row.sources.map(s=>({quoteId:s.id,fixtureId:row.fixture.id,providerFixtureId:s.fixture,provider:'ODDSPAPI',
  bookmaker:s.book,bookmakerId:s.book,bookmakerName:bookmakerConfig(s.book)?.displayName??s.book,market:'MATCH_WINNER',outcome:s.outcome,line:null,
  decimalOdds:s.price,status:s.status,scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:s.updated,observedAt:s.observed,
  lastSuccessfulRefreshAt:s.refreshed,persistedAt:s.observed,providerKickoff:row.providerKickoff,geoEligible:true,sourceDomain:s.domain,
  freshnessTtlMinutes:Number(s.ttl),sourceGeo:s.geo,targetGeo:row.geo,providerBookmakerId:s.providerBookmakerId})) as NonNullable<OddsReadSnapshot['referenceQuotes']>;
 const primary=primaryVisibleBookmakers(row.geo as CoreGeo);
 return {fixtureId:row.fixture.id,kickoff:row.fixture.kickoff,fixtureStatus:row.fixture.status,referenceGapBookmakers:primary,
  eligibleBookmakers:primary.map((id,priority)=>({id,name:bookmakerConfig(id)!.displayName,priority})),
  quotes:references.filter(q=>q.sourceGeo===row.geo),referenceQuotes:references,insuranceEnabled:false};
}
describe('reported Production missing-odds fixtures, 2026-10-08',()=>{
 it.each(['FC Barcelona','Real Madrid'])('%s: keeps real 1xBet and suppresses redundant foreign references for covered outcomes',home=>{
  const row=evidence.fixtures.find(r=>r.fixture.home===home)!,s=snapshot(row),result=publicOddsComparisons([buildComparison(s,'MATCH_WINNER',now)])[0];
  expect(result.references??[]).toEqual([]);
  expect(result.rows.find(r=>r.bookmaker==='inkabet')?.cells.every(c=>c.decimalOdds===null)).toBe(true);
  expect(result.rows.find(r=>r.bookmaker==='1xbet')?.cells.every(c=>c.priceKind==='REAL'&&!c.best)).toBe(true);
 });
 it.each(['Málaga','Querétaro','Juárez'])('%s: does not resurrect suspended or reference-expired quotes',home=>{
  const row=evidence.fixtures.find(r=>r.fixture.home===home)!,s=snapshot(row);
  expect(s.referenceQuotes!.length).toBeGreaterThan(0);
  for(const outcome of ['HOME','DRAW','AWAY'] as const)expect(selectIndicativeQuote(s,'MATCH_WINNER',outcome,null,now)).toBeNull();
  expect(buildComparison(s,'MATCH_WINNER',now).references??[]).toEqual([]);
 });
 it('recovers Alianza from every saved feed using exact competition, teams/roles and UTC kickoff',()=>{
  const f=evidence.fixtures.find(r=>r.fixture.home==='Alianza Petrolera')!.fixture;
  const canonical:CanonicalOddsFixture={id:f.id,competitionId:f.competition_id,competition:f.slug,sport:'FOOTBALL',homeId:f.home_team_id,home:f.home,awayId:f.away_team_id,away:f.away,kickoff:f.kickoff,status:f.status};
  expect(evidence.alianza).toHaveLength(4);
  for(const saved of evidence.alianza){
   const raw=saved.fixture as ProviderOddsFixture;
   expect(matchOddsFixture(raw,[canonical],[])).toMatchObject({state:'HIGH_CONFIDENCE',fixture:{id:f.id}});
   expect(saved.quotes).toHaveLength(3);expect(saved.quotes.every(q=>q.status==='ACTIVE')).toBe(true);
   expect(matchOddsFixture({...raw,kickoff:'2026-10-10T23:00:00Z'},[canonical],[]).fixture).toBeNull();
   expect(matchOddsFixture({...raw,homeNames:raw.awayNames,awayNames:raw.homeNames},[canonical],[]).fixture).toBeNull();
  }
  const quotes=evidence.alianza.filter(s=>['betsson','bwin'].includes(s.book)).flatMap(s=>s.quotes.map((q,index)=>({...q,fixtureId:f.id,quoteId:`saved-${s.book}-${index}`,bookmakerId:s.book,bookmakerName:s.book,provider:'ODDSPAPI',geoEligible:true,providerKickoff:f.kickoff,persistedAt:q.observedAt,lastSuccessfulRefreshAt:q.observedAt,freshnessTtlMinutes:365}))) as ReadOddsQuote[];
  const result=buildComparison({fixtureId:f.id,fixtureStatus:f.status,kickoff:f.kickoff,quotes,eligibleBookmakers:['betsson','bwin'].map((id,priority)=>({id,name:id,priority})),insuranceEnabled:false},'MATCH_WINNER',now);
  expect(result.eligiblePrices).toBe(6);expect(result.rows.map(r=>r.cells.map(c=>Number(c.decimalOdds)))).toEqual([[2.42,3.15,2.85],[2.45,2.95,2.85]]);
 });
});
