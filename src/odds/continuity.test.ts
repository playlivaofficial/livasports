import {describe,it,expect} from 'vitest';
import {planTarget,planScheduler,nativeSafetyMarginMinutes,type RefreshTarget} from './scheduler-policy';
import {continuityMetrics,combineContinuity} from './continuity';
import {selectNativeQuote,buildComparison} from './comparison';
import type {ReadOddsQuote,OddsReadSnapshot} from './types';
import type {NativeCell} from './native-coverage';
import {schedulerTournaments} from '../providers/oddspapi/tournament-catalog';
import {namesMatch} from './matching';
const now=new Date('2026-09-21T12:00:00Z');
const target:RefreshTarget={bookmaker:'betsson',tournamentId:'325',fixtures:[{id:'f',kickoff:'2026-09-22T12:00:00Z',status:'SCHEDULED'}],publicEligible:true,hasUsefulCoverage:true,lastSuccessAt:'2026-09-21T10:00:00Z',retryAfter:null,nativeExpiryAt:'2026-09-21T12:08:00Z',recentNative:true};
describe('native expiry deadlines',()=>{
 it('rescues before frozen expiry even if budget-scaled normal cadence moved later',()=>{
  const p=planTarget(target,4,now,3);expect(p.due).toBe(true);expect(p.rescue).toBe(true);expect(p.normalDueAt).toBe('2026-09-21T16:00:00.000Z');
 });
 it('retains hard backoff, while legacy transient state is explicitly classified',()=>{const p=planTarget({...target,retryAfter:'2026-09-21T13:00:00Z',lastError:'ODDSPAPI_HTTP_500'},4,now,3);expect(p.due).toBe(false);expect(p.delayReason).toBe('HTTP_5XX_TRANSIENT');});
 it('rescue beats distant ordinary work without bypassing hard stop',()=>{
  const far={...target,bookmaker:'betboo.bet.br',tournamentId:'390',nativeExpiryAt:null,recentNative:false,lastSuccessAt:null,fixtures:[{id:'far',status:'SCHEDULED',kickoff:'2026-09-26T12:00:00Z'}]};
  const budget={verified:true,routineRemaining:3000,period_end:'2026-10-02',dailyCap:274,rollingDay:218};
  expect(planScheduler([far,target],now,budget).batches[0]?.bookmaker).toBe('betsson');
  expect(planScheduler([far,target],now,{...budget,rollingDay:219}).batches).toEqual([]);
 });
 it('unsupported target has no due request',()=>{expect(planScheduler([{...target,unsupported:true}],now).batches).toEqual([]);});
 it('an ordinary cadence refresh is not mislabeled as an expiry rescue',()=>{expect(planTarget({...target,nativeExpiryAt:'2026-09-21T18:00:00Z'},4,now).rescue).toBe(false);});
 it('expired native is recovery priority, not successful pre-expiry rescue',()=>{
  expect(planTarget({...target,nativeExpiryAt:'2026-09-21T11:59:00Z'},4,now)).toMatchObject({rescue:false,nativeRecovery:true,due:true});
 });
 it('five-minute scheduler simulation preserves fresh native without extending an observed TTL',()=>{
  let current={...target};let refreshes=0;
  for(let tick=0;tick<18;tick++){
    const at=new Date(+now+tick*300000);
    const p=planTarget(current,4,at,3);
    expect(Date.parse(current.nativeExpiryAt!)>+at).toBe(true);
    if(p.due){refreshes++;current={...current,lastSuccessAt:at.toISOString(),nativeExpiryAt:new Date(+at+65*60000).toISOString()};}
  }
  expect(refreshes).toBe(2);
 });
 it('empty catalog uses a bounded twelve-hour recheck, not permanent suppression',()=>{
  const catalog=schedulerTournaments([{tournamentId:329,tournamentSlug:'copa-del-rey',categorySlug:'spain',futureFixtures:0,upcomingFixtures:0}]);
  expect(catalog.find(t=>t.id==='329')?.catalogEmpty).toBe(true);
  expect(planTarget({...target,catalogEmpty:true,nativeExpiryAt:null},4,now).intervalMinutes).toBe(720);
  expect(planTarget({...target,catalogEmpty:true,nativeExpiryAt:null,lastCheckedAt:now.toISOString()},4,now).due).toBe(false);
  expect(planTarget({...target,catalogEmpty:true,nativeExpiryAt:null,lastCheckedAt:new Date(+now-721*60000).toISOString()},4,now).due).toBe(true);
  expect(schedulerTournaments([{tournamentId:329,tournamentSlug:'copa-del-rey',categorySlug:'spain',futureFixtures:3,upcomingFixtures:2}]).find(t=>t.id==='329')?.catalogEmpty).not.toBe(true);
 });
 it('reviewed future aliases remain competition-specific and do not broaden team-name matching',()=>{
  expect(namesMatch(['Racing Club Avellaneda'],'Racing Club','argentina-primera-division')).toBe(true);
  expect(namesMatch(['Racing Club Avellaneda'],'Racing Club','liga-mx')).toBe(false);
  expect(namesMatch(['FK Kauno Zalgiris'],'Kauno Žalgiris','conference-league')).toBe(true);
  expect(namesMatch(['FK Any Team'],'Any Team','conference-league')).toBe(false);
 });
 it('success moves expiry deadline forward; no immediate rescue loop',()=>{expect(planTarget({...target,lastSuccessAt:now.toISOString(),nativeExpiryAt:'2026-09-21T14:05:00Z'},4,now).due).toBe(false);});
 it('bounds configuration',()=>{expect(nativeSafetyMarginMinutes('bad')).toBe(10);expect(nativeSafetyMarginMinutes('0')).toBe(5);expect(nativeSafetyMarginMinutes('100')).toBe(30);});
});
const quote={bookmaker:'betsson',bookmakerName:'Betsson',provider:'ODDSPAPI',quoteId:'p',market:'MATCH_WINNER',outcome:'HOME',line:null,decimalOdds:'2.2',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',geoEligible:true,observedAt:'2026-09-21T11:00:00Z',providerUpdatedAt:'2026-09-21T11:00:00Z',lastSuccessfulRefreshAt:'2026-09-21T11:00:00Z',providerKickoff:'2026-09-22T12:00:00Z',freshnessTtlMinutes:65} as ReadOddsQuote;
// Colombia: Betsson is the card under test and bwin is the only other public source it can borrow
// from. Proxy coverage is opted into here; production pins insuranceEnabled false.
const snap:OddsReadSnapshot={quotes:[quote,{...quote,bookmaker:'bwin',bookmakerName:'bwin',quoteId:'fallback',freshnessTtlMinutes:180}],kickoff:quote.providerKickoff,fixtureStatus:'SCHEDULED',eligibleBookmakers:[{id:'betsson',name:'Betsson',priority:10},{id:'bwin',name:'bwin',priority:20}],insuranceEnabled:true};
describe('continuity truth and second supplier boundary',()=>{
 it('native wins, expires honestly under quota/500, recovers immediately after successful refresh',()=>{
  const cell=(s:OddsReadSnapshot,t:number)=>buildComparison(s,'MATCH_WINNER',t).rows.find(r=>r.bookmaker==='betsson')!.cells[0];
  expect(cell(snap,+now).priceKind).toBe('REAL');
  expect(cell(snap,+now+6*60000).priceKind).toBe('PROXY');
  const recovered={...snap,quotes:[{...quote,observedAt:new Date(+now+6*60000).toISOString(),lastSuccessfulRefreshAt:new Date(+now+6*60000).toISOString()},snap.quotes[1]]};
  expect(cell(recovered,+now+6*60000).priceKind).toBe('REAL');
 });
 it('approved secondary same-bookmaker quote is native, never cross-bookmaker insurance',()=>{
  const secondary={...quote,provider:'APPROVED_SECONDARY',quoteId:'s',decimalOdds:'2.3',freshnessTtlMinutes:180};
  const s={...snap,quotes:[quote,secondary,snap.quotes[1]],approvedNativeProviders:['ODDSPAPI','APPROVED_SECONDARY']};
  expect(selectNativeQuote([quote,secondary],s,+now)?.quoteId).toBe('p');
  expect(buildComparison(s,'MATCH_WINNER',+now+6*60000).rows.find(r=>r.bookmaker==='betsson')?.cells[0]).toMatchObject({priceKind:'REAL',sourceQuoteId:'s',sourceBookmaker:'betsson'});
  expect(selectNativeQuote([secondary],snap,+now)).toBeUndefined();
 });
 it('measures transitions and observed time, excluding unsampled downtime',()=>{
  const cell={fixtureId:'f',competition:'c',bookmaker:'betsson',market:'MATCH_WINNER',outcome:'HOME',window:'2-24h',kind:'REAL',reason:null,source:'betsson'} as NativeCell;
  const samples=[{at:now.toISOString(),cells:[cell]},{at:new Date(+now+300000).toISOString(),cells:[{...cell,kind:'PROXY' as const,reason:'STALE_OR_EXPIRED' as const}]},{at:new Date(+now+600000).toISOString(),cells:[cell]}];
  expect(continuityMetrics(samples).find(g=>g.key==='*')).toMatchObject({nativeContinuityPct:50,fallbackSeconds:300,nativeToFallback:1,recoveries:1,expiryMisses:1});
  expect(combineContinuity([...continuityMetrics(samples.slice(0,2)),...continuityMetrics(samples.slice(1))])).toEqual(continuityMetrics(samples));
  expect(continuityMetrics([samples[0],{...samples[2],at:new Date(+now+3600000).toISOString()}])).toEqual([]);
 });
});
