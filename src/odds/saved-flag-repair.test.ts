import {describe,it,expect} from 'vitest';
import {repairSavedPeruOneXBetFlags} from './saved-flag-repair';
import {quoteState} from './comparison';
import type {OddsSnapshot,OddsReadSnapshot,ReadOddsQuote} from './types';
const at='2026-10-08T08:20:18.394Z';
const sample=():OddsSnapshot=>({bookmaker:'1xbet',providerBookmakerId:'1xbet',observedAt:at,tournamentIds:['406'],rejected:{},
  geoFeeds:[{geo:'PE',operatorId:'1xbet',providerBookmakerId:'1xbet',sourceDomains:['1xbet.com']}],
  fixtures:[{providerId:'provider-event',sport:'FOOTBALL',competition:'peru-liga-1',providerCompetitionId:'406',kickoff:'2026-10-10T00:00:00Z',status:'PREGAME',homeProviderId:'home',awayProviderId:'away',homeNames:['Home'],awayNames:['Away']}],
  quotes:[{bookmaker:'1xbet',providerFixtureId:'provider-event',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.12345678',status:'SUSPENDED',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:at,observedAt:at,sourceDomain:'1xbet.com'}],
  offerFlags:[{providerFixtureId:'provider-event',market:'MATCH_WINNER',outcome:'HOME',bookmakerActive:false,bookmakerSuspended:false,marketActive:true,priceActive:true}]});
describe('saved Peru 1xBet flag correction',()=>{
  it('changes only the status, keeps original decimals/timestamps, and is idempotent',()=>{
    const original=sample(),result=repairSavedPeruOneXBetFlags(original);
    expect(result.repaired).toBe(1);expect(result.snapshot.quotes[0]).toEqual({...original.quotes[0],status:'ACTIVE'});
    expect(result.snapshot.observedAt).toBe(at);expect(original.quotes[0].status).toBe('SUSPENDED');
    expect(repairSavedPeruOneXBetFlags(result.snapshot).repaired).toBe(0);
  });
  it('keeps public freshness and kickoff expiry after a saved replay',()=>{
    const s=repairSavedPeruOneXBetFlags(sample()).snapshot;
    const quote={...s.quotes[0],providerKickoff:s.fixtures[0].kickoff,lastSuccessfulRefreshAt:at,freshnessTtlMinutes:120,geoEligible:true} as ReadOddsQuote;
    const read={fixtureStatus:'SCHEDULED',kickoff:s.fixtures[0].kickoff,quotes:[quote]} as OddsReadSnapshot;
    expect(quoteState(quote,read,Date.parse(at)+119*60000)).toBe('ACTIVE');
    expect(quoteState(quote,read,Date.parse(at)+120*60000)).toBe('STALE');
    expect(quoteState(quote,read,Date.parse(s.fixtures[0].kickoff))).toBe('CLOSED');
  });
  it.each(['price','market','missing','duplicate','timestamp','future','started','closed','geo','feed','kickoff','decimal','phase','scope'])('refuses %s evidence',kind=>{
    const s=sample();
    if(kind==='price')s.offerFlags![0].priceActive=false;
    if(kind==='market')s.offerFlags![0].marketActive=false;
    if(kind==='missing')s.offerFlags=[];
    if(kind==='duplicate')s.offerFlags!.push({...s.offerFlags![0]});
    if(kind==='timestamp')s.quotes[0].providerUpdatedAt=null;
    if(kind==='future')s.quotes[0].providerUpdatedAt='2026-10-08T09:00:00Z';
    if(kind==='started')s.fixtures[0].status='OTHER';
    if(kind==='closed')s.quotes[0].status='CLOSED';
    if(kind==='geo')s.geoFeeds![0].geo='CO';
    if(kind==='feed')s.providerBookmakerId='other';
    if(kind==='kickoff')s.fixtures[0].kickoff='invalid';
    if(kind==='decimal')s.quotes[0].decimalOdds='NaN';
    if(kind==='phase')Object.assign(s.quotes[0],{phase:'LIVE'});
    if(kind==='scope')Object.assign(s.quotes[0],{scope:'FIRST_HALF'});
    expect(repairSavedPeruOneXBetFlags(s)).toEqual({snapshot:s,repaired:0});
  });
});
