import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readFourSourceHealth} from '../src/odds/four-source-health';
import {schedulerPlan} from '../src/odds/scheduler';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';
import {budgetHealth} from '../src/odds/budget';

// Read-only production audit: no provider, migration, refresh, or test-data writes.
const metrics:number[]=[];
const db=new PostgresDatabaseClient(databaseUrl()!,m=>metrics.push(m.durationMs),{statementTimeoutMs:15000});
try{
  const catalog=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0];
  const migrations=(await db.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows;
  const books=(await db.query('SELECT provider_slug,enabled,comparison_enabled,affiliate_status FROM bookmakers ORDER BY provider_slug')).rows;
  const integrity=(await db.query(`SELECT
    (SELECT count(*) FROM competitions WHERE enabled) AS enabled_competitions,
    (SELECT count(*) FROM fixtures) AS fixtures,
    (SELECT count(*) FROM odds_current) AS quotes,
    (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,line FROM odds_current GROUP BY 1,2,3,4,5 HAVING count(*)>1) x) AS duplicate_quotes,
    (SELECT count(*) FROM odds_current o LEFT JOIN fixtures f ON f.id=o.fixture_id LEFT JOIN bookmakers b ON b.id=o.bookmaker_id WHERE f.id IS NULL OR b.id IS NULL) AS orphan_quotes,
    (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING' AND lease_expires_at>now()) AS active_jobs`)).rows[0];
  const budget=await budgetHealth(db);
  const plan=await schedulerPlan(db,new Date(),schedulerTournaments(catalog?.tournaments??[]));
  const started=performance.now();const health=await readFourSourceHealth(db);const healthMs=Math.round(performance.now()-started);
  const result={at:new Date().toISOString(),providerRequests:0,migrations,books,integrity,budget,
    plan:{cadence:plan.cadence,pacing:plan.pacing,maximumBillableRequests:plan.maximumBillableRequests},health,healthMs,queryCount:metrics.length,totalQueryMs:Math.round(metrics.reduce((a,b)=>a+b,0))};
  await writeFile('output/p5-readiness-private.json',JSON.stringify(result,null,2));
  console.info(JSON.stringify({at:result.at,providerRequests:0,integrity,books,latestMigration:migrations.at(-1),budget,plan:result.plan,healthMs,queryCount:result.queryCount,totalQueryMs:result.totalQueryMs}));
}catch(error){console.error(JSON.stringify({error:error instanceof Error?error.name:'READ_FAILED'}));process.exitCode=1;}finally{await db.close();}
