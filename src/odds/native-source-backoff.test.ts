import {describe,it,expect} from 'vitest';
import {classifyBackoff,effectiveBackoffAt,backoffJitterMinutes} from './backoff-policy';
import {buildComparison,selectNativeMarketQuotes} from './comparison';
import type {OddsReadSnapshot,ReadOddsQuote} from './types';
import {validateNativeSourceBatch} from '@/providers/contracts/NativeOddsSource';
import {discoverCanonicalMarketRules} from '@/providers/oddspapi/m5-normalizer';
import {planScheduler,type RefreshTarget} from './scheduler-policy';

const now=Date.parse('2026-10-01T12:00:00Z'),kickoff='2026-10-01T18:00:00Z';
const quote=(provider:string,outcome:'HOME'|'DRAW'|'AWAY',observedAt:string,price:string):ReadOddsQuote=>({provider,quoteId:`${provider}-${outcome}`,fixtureId:'f',providerFixtureId:`${provider}-f`,bookmaker:'bwin',bookmakerId:'b',bookmakerName:'bwin',market:'MATCH_WINNER',outcome,line:null,decimalOdds:price,status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:observedAt,observedAt,persistedAt:observedAt,lastSuccessfulRefreshAt:observedAt,providerKickoff:kickoff,freshnessTtlMinutes:600,sourceDomain:'sports.bwin.com',geoEligible:true});
const market=(provider:string,stamp:string,prices=['2.0','3.0','4.0'])=>['HOME','DRAW','AWAY'].map((outcome,i)=>quote(provider,outcome as 'HOME'|'DRAW'|'AWAY',stamp,prices[i]));

describe('failure-proportional target backoff',()=>{
  it('isolates a never-successful 404 for twelve hours without treating a recovered feed the same',()=>{
    expect(classifyBackoff({code:'ODDSPAPI_HTTP_404',neverSucceeded:true,isolated:true})).toMatchObject({failureClass:'HARD_TARGET',subreason:'HTTP_404_TARGET_NOT_FOUND',delayMinutes:720,hard:true});
    expect(classifyBackoff({code:'ODDSPAPI_HTTP_404',neverSucceeded:false,isolated:true})).toMatchObject({failureClass:'DATA_EMPTY',subreason:'EMPTY_TEMPORARY_RESPONSE',delayMinutes:30,hard:false});
  });
  it('bounds transient recovery and never reconsiders hard/rate-limit state early',()=>{
    expect(classifyBackoff({code:'ODDSPAPI_HTTP_503',consecutiveFailures:9}).delayMinutes).toBe(60);
    const common={retryAfter:'2026-10-01T16:00:00Z',lastAttemptAt:'2026-10-01T11:00:00Z',recentNative:true,nativePriority:3,nearKickoff:true,closeToExpiry:false,bookmaker:'betsson',tournamentId:'17'};
    expect(effectiveBackoffAt({...common,failureClass:'TRANSIENT_PROVIDER',subreason:'HTTP_5XX_TRANSIENT'})).toBeLessThan(Date.parse(common.retryAfter));
    expect(effectiveBackoffAt({...common,failureClass:'HARD_TARGET',subreason:'HTTP_404_TARGET_NOT_FOUND'})).toBe(Date.parse(common.retryAfter));
    expect(classifyBackoff({code:'ODDSPAPI_HTTP_429'}).hard).toBe(true);
    expect(backoffJitterMinutes('betsson','17')).toBeGreaterThanOrEqual(0);expect(backoffJitterMinutes('betsson','17')).toBeLessThan(5);
  });
  it('isolates a 404, gradually re-admits a high-value transient target, and still obeys the quota stop',()=>{
    const base:RefreshTarget={bookmaker:'betsson',tournamentId:'17',fixtures:[{id:'f',kickoff,status:'SCHEDULED'}],publicEligible:true,
      hasUsefulCoverage:false,lastSuccessAt:'2026-10-01T09:00:00Z',retryAfter:null,lastAttemptAt:'2026-10-01T11:00:00Z',consecutiveFailures:0};
    const hard={...base,tournamentId:'329',lastSuccessAt:null,retryAfter:'2026-10-01T16:00:00Z',failureClass:'HARD_TARGET',backoffReason:'HTTP_404_TARGET_NOT_FOUND',consecutiveFailures:3};
    const transient={...base,tournamentId:'390',retryAfter:'2026-10-01T16:00:00Z',failureClass:'TRANSIENT_PROVIDER',backoffReason:'HTTP_5XX_TRANSIENT',recentNative:true,nativePriority:3,consecutiveFailures:2};
    const open=planScheduler([hard,base,transient],new Date(now),{verified:true,routineRemaining:4000,period_end:'2026-11-01T00:00:00Z',rollingDay:20,dailyCap:100});
    const ids=open.batches.flatMap(batch=>batch.tournamentIds);
    expect(ids).toContain('17');expect(ids).toContain('390');expect(ids).not.toContain('329');
    expect(planScheduler([base,transient],new Date(now),{verified:true,routineRemaining:4000,period_end:'2026-11-01T00:00:00Z',rollingDay:80,dailyCap:100}).batches).toEqual([]);
  });
});

describe('provider-independent native market resolution',()=>{
  it('keeps one complete supplier snapshot and deterministically chooses the fresher disagreement',()=>{
    const a=market('ODDSPAPI','2026-10-01T11:00:00Z'),b=market('SECONDARY','2026-10-01T11:05:00Z',['2.2','3.2','4.2']);
    const snapshot:OddsReadSnapshot={quotes:[...a,...b],kickoff,fixtureStatus:'SCHEDULED',approvedNativeProviders:['ODDSPAPI','SECONDARY']};
    const selected=selectNativeMarketQuotes(snapshot.quotes,'MATCH_WINNER',snapshot,now);
    expect([...selected.values()].map(row=>row.provider)).toEqual(['SECONDARY','SECONDARY','SECONDARY']);
    expect(buildComparison(snapshot,'MATCH_WINNER',now).rows.find(row=>row.bookmaker==='bwin')?.cells.map(cell=>cell.decimalOdds)).toEqual(['2.2','3.2','4.2']);
  });
  it('never synthesizes 1X2 from partial provider A plus partial provider B',()=>{
    const a=market('ODDSPAPI','2026-10-01T11:00:00Z').slice(0,2),b=market('SECONDARY','2026-10-01T11:05:00Z').slice(2);
    const snapshot:OddsReadSnapshot={quotes:[...a,...b],kickoff,fixtureStatus:'SCHEDULED',approvedNativeProviders:['ODDSPAPI','SECONDARY']};
    const selected=selectNativeMarketQuotes(snapshot.quotes,'MATCH_WINNER',snapshot,now);
    expect(selected.provider).toBe('ODDSPAPI');expect([...selected.keys()]).toEqual(['HOME','DRAW']);expect(selected.has('AWAY')).toBe(false);
  });
  it('accepts a verified future adapter batch without changing public bookmaker identity',()=>{
    const {batch,rejected}=validateNativeSourceBatch({sourceProvider:'SECONDARY',observedAt:'2026-10-01T11:05:00Z',requestCount:1,quotes:[{sourceProvider:'SECONDARY',fixture:{providerFixtureId:'pf',canonicalFixtureId:'11111111-1111-4111-8111-111111111111',mappingVerified:true},bookmaker:'bwin',providerBookmakerId:'bwin',market:'MATCH_WINNER',providerMarketId:'1x2',outcome:'HOME',line:null,decimalOdds:'2.20',status:'ACTIVE',providerUpdatedAt:'2026-10-01T11:04:00Z',observedAt:'2026-10-01T11:05:00Z',providerKickoff:kickoff,freshnessTtlMinutes:30,sourceDomain:'sports.bwin.com',confidence:'VERIFIED'}]});
    expect(batch.quotes[0].bookmaker).toBe('bwin');expect(batch.sourceProvider).toBe('SECONDARY');expect(rejected).toEqual([]);
  });
});

describe('OddsPapi alternate-market discovery',()=>{
  it('accepts an alternate ID only with exact full-time 1X2 semantics',()=>{
    const markets=[{marketId:999,sportId:10,marketName:'Full Time Result',marketType:'1x2',period:'fulltime',playerProp:false,handicap:0,outcomes:[{outcomeId:991,outcomeName:'1'},{outcomeId:992,outcomeName:'X'},{outcomeId:993,outcomeName:'2'}]},
      {marketId:998,sportId:10,marketName:'Full Time Result',marketType:'1x2',period:'firsthalf',playerProp:false,handicap:0,outcomes:[{outcomeId:1,outcomeName:'1'},{outcomeId:2,outcomeName:'X'},{outcomeId:3,outcomeName:'2'}]}];
    expect(discoverCanonicalMarketRules(markets)['999']).toMatchObject({market:'MATCH_WINNER',outcomes:{'991':{code:'HOME'},'992':{code:'DRAW'},'993':{code:'AWAY'}}});
    expect(discoverCanonicalMarketRules(markets)['998']).toBeUndefined();
  });
});
