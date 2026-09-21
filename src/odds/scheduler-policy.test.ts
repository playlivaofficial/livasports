import {describe,it,expect} from 'vitest';
import {budgetCadence,forecastRequests,cadenceIntervalMinutes,freshnessTtlMs,planScheduler,planTarget,splitProviderBatches,type RefreshTarget} from './scheduler-policy';
const now=new Date('2026-09-30T23:55:00Z');
const target=(hours:number,overrides:Partial<RefreshTarget>={}):RefreshTarget=>({bookmaker:'betano.bet.br',tournamentId:'325',
  publicEligible:true,hasUsefulCoverage:true,lastSuccessAt:'2026-09-30T20:00:00Z',retryAfter:null,
  fixtures:[{id:'real-shape-test-only',kickoff:new Date(now.getTime()+hours*3600000).toISOString(),status:'SCHEDULED'}],...overrides});
describe('shared adaptive pregame scheduler',()=>{
  it.each([[240,'NO_UPCOMING',null],[72,'FAR_FUTURE',360],[24,'WITHIN_48H',120],[6,'WITHIN_12H',120],[1,'WITHIN_2H',15],[0.1,'FINAL_PREGAME',15]])('classifies %sh conservatively',(hours,tier,minutes)=>{
    expect(planTarget(target(Number(hours)),1,now)).toMatchObject({tier,intervalMinutes:minutes});
  });
  it('excludes exact kickoff, past and terminal matches even if the DB status lags',()=>{
    for(const t of [target(0),target(-1),target(1,{fixtures:[{id:'test',kickoff:'2026-10-01T01:00:00Z',status:'FINISHED'}]})])
      expect(planTarget(t,1,now)).toMatchObject({tier:'NO_UPCOMING',due:false,fixtures:0});
  });
  it('keeps GEO isolation but discovers first prices at the same pregame cadence',()=>{
    expect(planTarget(target(0.1,{publicEligible:false}),1,now)).toMatchObject({tier:'GEO_GATED',intervalMinutes:1440,due:false});
    expect(planTarget(target(0.1,{hasUsefulCoverage:false}),1,now)).toMatchObject({tier:'FINAL_PREGAME',intervalMinutes:15,due:true});
  });
  it('batches multiple due tournaments once per bookmaker and gives nearer matches priority',()=>{
    const p=planScheduler([target(24,{tournamentId:'17'}),target(1),target(0.1,{bookmaker:'betsson',publicEligible:false})],now);
    expect(p.batches).toHaveLength(1);expect(p.batches[0].tournamentIds.sort()).toEqual(['17','325']);expect(p.maximumBillableRequests).toBe(1);
  });
  it('never puts more than four IDs in one OddsPapi batch, including a 22-ID regression replay',()=>{
    const flood=Array.from({length:22},(_,i)=>target(1,{tournamentId:String(100+i),lastSuccessAt:null}));
    const p=planScheduler(flood,now);
    expect(p.batches.every(batch=>batch.tournamentIds.length<=4)).toBe(true);
    expect(p.batches.every(batch=>batch.tournamentIds.length===1)).toBe(true);
    // Unproven (never successful) tournaments stay isolated and are bounded per tick so a flood cannot burst the budget.
    expect(p.batches).toHaveLength(2);
    expect(splitProviderBatches(flood).every(batch=>batch.length===1)).toBe(true);
    expect(splitProviderBatches(flood)).toHaveLength(22);
    const mixed=[target(1,{tournamentId:'325',lastSuccessAt:null}),target(1,{tournamentId:'27464',lastSuccessAt:null}),
      target(1,{tournamentId:'17',lastSuccessAt:null}),target(1,{tournamentId:'384',lastSuccessAt:null}),...flood];
    expect(splitProviderBatches(mixed)[0]).toEqual(['325','27464','17','384']);
    expect(splitProviderBatches(mixed).slice(1).every(batch=>batch.length===1)).toBe(true);
  });
  it('keeps the stable four in their own batch and never mixes a candidate into that request',()=>{
    const p=planScheduler([target(1,{tournamentId:'325'}),target(1,{tournamentId:'17'}),target(0.5,{tournamentId:'326',lastSuccessAt:null})],now);
    // Order follows imminence (the 0.5h unproven probe leads the 1h stable pair); membership is what must never mix.
    expect(p.batches).toHaveLength(2);
    expect(p.batches).toEqual(expect.arrayContaining([
      expect.objectContaining({tournamentIds:['325','17']}),
      expect.objectContaining({tournamentIds:['326']}),
    ]));
    const idleStable=planScheduler([
      target(1,{tournamentId:'325',lastSuccessAt:now.toISOString()}),
      target(1,{tournamentId:'17',lastSuccessAt:now.toISOString()}),
      target(0.5,{tournamentId:'326',lastSuccessAt:null}),
    ],now);
    expect(idleStable.batches).toEqual([expect.objectContaining({tournamentIds:['326']})]);
  });
  it('gives verified expanded coverage kickoff-sensitive refresh without a canary hold',()=>{
    expect(planTarget(target(1,{tournamentId:'390',lastSuccessAt:null}),2,now)).toMatchObject({intervalMinutes:30,due:true});
  });
  it('does not repeat a fresh target and honors persistent retry backoff',()=>{
    expect(planTarget(target(1,{lastSuccessAt:now.toISOString()}),1,now).due).toBe(false);
    expect(planTarget(target(1,{retryAfter:'2026-10-01T00:30:00Z'}),1,now).due).toBe(false);
  });
  it('paces two public feeds to the same monthly economics, and public TTL follows that 30m cadence',()=>{
    const p=planScheduler([target(1),target(1,{bookmaker:'betsson'})],now);
    expect(p.targets.every(t=>t.intervalMinutes===30)).toBe(true);
    expect(freshnessTtlMs(1,2)).toBe((30+5)*60000);
    expect(2*48*31).toBe(2976);
  });
  it('keeps public freshness at least one tick beyond each paid interval so scheduled quotes do not vanish between ticks',()=>{
    for(const [hours,feeds,interval] of [[1,1,15],[1,2,30],[6,1,120],[24,1,120],[72,1,360],[100,4,720]] as const){
      expect(cadenceIntervalMinutes(hours,feeds)).toBe(interval);
      expect(freshnessTtlMs(hours,feeds)).toBe((interval+5)*60000);
    }
    expect(cadenceIntervalMinutes(0,1)).toBeNull();expect(freshnessTtlMs(0,1)).toBe(0);
  });
  it('budgets all forty-four feeds over real kickoff windows and stops when the period is unverified',()=>{
    const feeds=['325','27464','17','384','390','8','35','23','679','480','242','34','238','37','18','7','155','182','53','52','328','21'].flatMap(tournamentId=>
      ['betano.bet.br','betsson'].map(bookmaker=>target(1,{tournamentId,bookmaker,lastSuccessAt:null,
        fixtures:Array.from({length:14},(_,i)=>({id:String(i),status:'SCHEDULED',kickoff:new Date(now.getTime()+(i*12+1)*3600000).toISOString()}))})));
    const budget={verified:true,routineRemaining:1000,period_end:new Date(now.getTime()+19*86400000)};
    const policy=budgetCadence(feeds,now,budget);
    expect(policy.activeFeeds).toBe(44);expect(policy.scale).toBeGreaterThan(1);
    expect(forecastRequests(feeds,now,policy.horizonDays,policy.scale)).toBeLessThanOrEqual(policy.dailyAllowance*policy.horizonDays);
    expect(planScheduler(feeds,now,{verified:false}).batches).toEqual([]);
  });
  it('uses age relative to cadence to keep an older expanded feed from starving behind newer nearby matches',()=>{
    const p=planScheduler([target(.2,{tournamentId:'390',lastSuccessAt:new Date(now.getTime()-31*60000).toISOString()}),
      target(10,{tournamentId:'242',lastSuccessAt:new Date(now.getTime()-12*3600000).toISOString()})],now);
    // Both feeds are proven (prior success, no failures) so they share one request; the older one still leads.
    expect(p.batches[0].tournamentIds).toEqual(['242','390']);expect(p.maximumBillableRequests).toBe(1);
  });
  describe('rolling-day pacing (P0 incident: burst-then-starve ticks left same-day fixtures stale)',()=>{
    const budget={verified:true,routineRemaining:2970,period_end:new Date(now.getTime()+14*86400000)};
    const old=new Date(now.getTime()-12*3600000).toISOString();
    // stable four far out (routine), one proven expanded feed kicking off in 6h (urgent), one recovery probe, both bookmakers.
    const feeds=['betano.bet.br','betsson'].flatMap(bookmaker=>[
      target(40,{bookmaker,tournamentId:'325',lastSuccessAt:old}),target(40,{bookmaker,tournamentId:'17',lastSuccessAt:old}),
      target(6,{bookmaker,tournamentId:'35',lastSuccessAt:old}),
      target(30,{bookmaker,tournamentId:'53',lastSuccessAt:null,hasUsefulCoverage:false})]);
    it('plans everything and reports no pacing when the ledger view is absent',()=>{
      const p=planScheduler(feeds,now,budget);
      expect(p.pacing).toMatchObject({headroom:null,routineHeadroom:null,deferredBatches:0});expect(p.batches.length).toBe(6);
    });
    it('never attempts more requests than the live headroom and spends them on the most imminent batches first',()=>{
      const p=planScheduler(feeds,now,{...budget,dailyCap:210,rollingDay:167});
      expect(p.maximumBillableRequests).toBe(1);expect(p.batches[0]).toMatchObject({tournamentIds:['35'],urgent:true});
      expect(p.pacing).toMatchObject({headroom:1,routineHeadroom:1,plannedBatches:6,deferredBatches:5,urgentBatches:1});
    });
    it('preserves emergency reserve even for automatic urgent batches at 80 percent',()=>{
      const p=planScheduler(feeds,now,{...budget,dailyCap:210,rollingDay:180});
      expect(p.pacing).toMatchObject({headroom:0,routineHeadroom:0});
      expect(p.batches).toEqual([]);
    });
    it('plans routine batches again once the rolling spend is below the reserve line',()=>{
      const p=planScheduler(feeds,now,{...budget,dailyCap:210,rollingDay:100});
      expect(p.pacing).toMatchObject({headroom:68,routineHeadroom:68,deferredBatches:0});
      expect(p.batches.some(b=>b.tournamentIds.includes('325'))).toBe(true);
      // urgent batches still lead the tick so a late ledger refusal never lands on an imminent fixture.
      expect(p.batches[0].urgent).toBe(true);
    });
  });
});
