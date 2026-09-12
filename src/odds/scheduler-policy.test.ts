import {describe,it,expect} from 'vitest';
import {planScheduler,planTarget,type RefreshTarget} from './scheduler-policy';
const now=new Date('2026-09-30T23:55:00Z');
const target=(hours:number,overrides:Partial<RefreshTarget>={}):RefreshTarget=>({bookmaker:'betano.bet.br',tournamentId:'325',
  publicEligible:true,hasUsefulCoverage:true,lastSuccessAt:'2026-09-30T20:00:00Z',retryAfter:null,
  fixtures:[{id:'real-shape-test-only',kickoff:new Date(now.getTime()+hours*3600000).toISOString(),status:'SCHEDULED'}],...overrides});
describe('shared adaptive pregame scheduler',()=>{
  it.each([[72,'FAR_FUTURE',1440],[24,'WITHIN_48H',120],[6,'WITHIN_12H',60],[1,'WITHIN_2H',15],[0.1,'FINAL_PREGAME',15]])('classifies %sh conservatively',(hours,tier,minutes)=>{
    expect(planTarget(target(Number(hours)),1,now)).toMatchObject({tier,intervalMinutes:minutes});
  });
  it('excludes exact kickoff, past and terminal matches even if the DB status lags',()=>{
    for(const t of [target(0),target(-1),target(1,{fixtures:[{id:'test',kickoff:'2026-10-01T01:00:00Z',status:'FINISHED'}]})])
      expect(planTarget(t,1,now)).toMatchObject({tier:'NO_UPCOMING',due:false,fixtures:0});
  });
  it('lowers unverified and no-coverage refresh to daily, with no traffic parameter',()=>{
    expect(planTarget(target(0.1,{publicEligible:false}),1,now)).toMatchObject({tier:'GEO_GATED',intervalMinutes:1440,due:false});
    expect(planTarget(target(0.1,{hasUsefulCoverage:false}),1,now)).toMatchObject({tier:'NO_USEFUL_COVERAGE',intervalMinutes:1440,due:false});
  });
  it('batches multiple due tournaments once per bookmaker and gives nearer matches priority',()=>{
    const p=planScheduler([target(24,{tournamentId:'17'}),target(1),target(0.1,{bookmaker:'betsson',publicEligible:false})],now);
    expect(p.batches).toHaveLength(1);expect(p.batches[0].tournamentIds).toEqual(['325','17']);expect(p.maximumBillableRequests).toBe(2);
  });
  it('does not repeat a fresh target and honors persistent retry backoff',()=>{
    expect(planTarget(target(1,{lastSuccessAt:now.toISOString()}),1,now).due).toBe(false);
    expect(planTarget(target(1,{retryAfter:'2026-10-01T00:30:00Z'}),1,now).due).toBe(false);
  });
  it('paces two public feeds to the same monthly economics, without widening public TTL',()=>{
    const p=planScheduler([target(1),target(1,{bookmaker:'betsson'})],now);
    expect(p.targets.every(t=>t.intervalMinutes===30)).toBe(true);
    expect(2*48*31).toBe(2976);
  });
});
