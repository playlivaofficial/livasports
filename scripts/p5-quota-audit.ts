import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {schedulerInputs} from '../src/odds/scheduler';
import {budgetCadence,forecastDetail,planTarget} from '../src/odds/scheduler-policy';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';

// Read-only audit; no provider calls or data writes outside the local evidence file.
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const now=new Date();const catalog=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
  const competitions=(await db.query('SELECT slug FROM competitions WHERE enabled ORDER BY slug')).rows;
  const mapped=schedulerTournaments(catalog?.tournaments??[]);
  const {targets,budget}=await schedulerInputs(db,mapped);
  const cadence=budgetCadence(targets,now,budget);
  const traffic=(await db.query(`SELECT purpose,endpoint,http_status,outcome,count(*)::int AS requests FROM odds_provider_requests
    WHERE started_at>now()-interval '24 hours' GROUP BY 1,2,3,4 ORDER BY 1,2,3`)).rows;
  const result={at:now.toISOString(),providerRequests:0,enabledCompetitions:competitions.length,competitions,budget,cadence,
    forecast:forecastDetail(targets,now,cadence.horizonDays,cadence.scale),traffic,
    byCompetition:competitions.map(c=>({competition:c.slug,providerIds:mapped.filter(t=>t.canonical===c.slug).map(t=>t.id),
      attributedRequests7d:mapped.filter(t=>t.canonical===c.slug).reduce((n,t)=>n+(cadence.forecast.byCompetition[t.id]??0),0)})),
    targets:targets.map(t=>({...planTarget(t,4,now,cadence.scale),lastSuccessAt:t.lastSuccessAt,consecutiveFailures:t.consecutiveFailures})),
    rawTargets:targets};
  await writeFile('output/p5-quota-audit-private.json',JSON.stringify(result,null,2));
  console.info(JSON.stringify({at:result.at,providerRequests:0,enabledCompetitions:competitions.length,cadence,budget,traffic}));
}finally{await db.close();}
