import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {canonicalFixtures} from '../src/odds/ingestion';
import {M5_TOURNAMENTS} from '../src/providers/oddspapi/m5-normalizer';
import {planScheduler,type RefreshTarget} from '../src/odds/scheduler-policy';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const now=new Date();const fixtures=await canonicalFixtures(db);
  const budget=(await db.query("SELECT period_start,period_end FROM odds_budget_baselines WHERE now()>=period_start AND now()<period_end")).rows[0];
  const targets:RefreshTarget[]=['betano.bet.br','betsson'].flatMap(bookmaker=>M5_TOURNAMENTS.map(t=>({bookmaker,tournamentId:t.id,
    fixtures:fixtures.filter(f=>f.competition===t.canonical),publicEligible:bookmaker==='betano.bet.br',hasUsefulCoverage:true,lastSuccessAt:null,retryAfter:null})));
  const daily:Record<string,number>={};let calls=0;
  for(let at=now.getTime();at<budget.period_end.getTime();at+=5*60000){
    const tick=new Date(at);const plan=planScheduler(targets,tick);
    for(const batch of plan.batches){calls++;daily[tick.toISOString().slice(0,10)]=(daily[tick.toISOString().slice(0,10)]??0)+1;
      for(const target of targets)if(target.bookmaker===batch.bookmaker&&batch.tournamentIds.includes(target.tournamentId))target.lastSuccessAt=tick.toISOString();}
  }
  const result={at:now.toISOString(),kind:'READ_ONLY_SIMULATION_NOT_AUTOMATION',period:budget,
    fixtureCounts:M5_TOURNAMENTS.map(t=>({competition:t.canonical,tournamentId:t.id,upcoming:fixtures.filter(f=>f.competition===t.canonical&&f.status==='SCHEDULED'&&Date.parse(f.kickoff)>now.getTime()).length})),
    frozenInventoryRemainingPeriodCalls:calls,daily,providerRequestsConsumed:0,
    assumptions:['Existing real DB schedule only; no invented future fixture arrivals','Current verified Betano/public and generic Betsson/gated state','Every target assumed to retain coverage: conservative overestimate',
      '5-minute external scheduler ticks, one request per due bookmaker batch','No provider failures; add reserved retry/diagnostic allowance','Not a promise of fresh prices between budget-limited refresh tiers'],
    worstCase30Days:3000,reserveBreakdown:{diagnostics:50,retries:100,discovery:100,mappingReconciliation:50,manualEmergency:50},
    conservativeExistingUsage:65,total30DayEnvelope:3415,routineCeiling:4000,internalCeiling:4500,providerCeiling:5000};
  await writeFile('output/m5-1-forecast-private.json',JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch{console.error('M5_1_FORECAST_FAILED');process.exitCode=1;}finally{await db.close();}
