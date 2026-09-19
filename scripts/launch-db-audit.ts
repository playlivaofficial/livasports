/** Read-only launch evidence. Never calls a provider or selects credentials/PII. */
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readReliabilityHealth} from '../src/odds/reliability/read';

const url=databaseUrl();
if(!url)throw new Error('DATABASE_NOT_CONFIGURED');
const database=new PostgresDatabaseClient(url);
try {
  const expected=(await readdir('db/migrations')).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
  const result=await database.transaction(async db=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await db.query("SET LOCAL statement_timeout='60s'");
    const migrations=(await db.query('SELECT filename,applied_at FROM schema_migrations ORDER BY filename')).rows;
    const indexes=(await db.query('SELECT indexrelid::regclass::text AS name FROM pg_index WHERE NOT indisvalid OR NOT indisready')).rows;
    const locks=(await db.query('SELECT count(*)::int AS blocked FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND datname=current_database()')).rows;
    const connections=(await db.query('SELECT state,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state')).rows;
    const tables=(await db.query(`SELECT relname,n_live_tup,n_dead_tup,last_autovacuum,pg_total_relation_size(relid)::bigint AS bytes
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20`)).rows;
    const counts=(await db.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled)::int AS enabled_competitions,
      (SELECT count(*) FROM fixtures)::int AS fixtures,(SELECT count(*) FROM teams)::int AS teams,
      (SELECT count(*) FROM analytics_events)::int AS analytics_events,(SELECT count(*) FROM analytics_sessions)::int AS analytics_sessions,
      (SELECT count(*) FROM odds_incidents)::int AS incidents`)).rows[0];
    const analytics=(await db.query(`SELECT traffic_class,count(*)::int AS events,count(DISTINCT event_id)::int AS unique_events,
      min(occurred_at) AS first,max(occurred_at) AS last FROM analytics_events GROUP BY traffic_class`)).rows;
    const scheduler=(await db.query(`SELECT date_trunc('hour',started_at) AS hour,trigger_source,status,count(*)::int AS jobs,
      sum(provider_requests)::int AS provider_requests FROM odds_sync_jobs WHERE started_at>now()-interval '24 hours'
      GROUP BY 1,2,3 ORDER BY 1 DESC`)).rows;
    const integrity=(await db.query(`SELECT
      (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,line,phase,scope FROM odds_current GROUP BY 1,2,3,4,5,6,7 HAVING count(*)>1) d)::int AS duplicate_quotes,
      (SELECT count(*) FROM odds_current o LEFT JOIN fixtures f ON f.id=o.fixture_id WHERE f.id IS NULL)::int AS orphan_quotes,
      (SELECT count(*) FROM analytics_sessions s WHERE traffic_class='HUMAN' AND EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=s.session_id AND e.traffic_class IN ('QA','OWNER','BOT')))::int AS mixed_human_sessions`)).rows[0];
    const reliability=await readReliabilityHealth(db,new Date(),{automationEnabled:true,emailConfigured:false});
    return {at:new Date().toISOString(),readOnly:true,providerRequests:0,
      migrations:{expected,applied:migrations,exact:expected.length===migrations.length&&expected.every((f,i)=>f===migrations[i].filename)},
      invalidIndexes:indexes,locks,connections,tables,counts,analytics,scheduler,integrity,reliability};
  });
  await mkdir('output',{recursive:true});
  await writeFile('output/hardening-db-audit.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({at:result.at,migrationsExact:result.migrations.exact,invalidIndexes:result.invalidIndexes.length,
    locks:result.locks,counts:result.counts,integrity:result.integrity,overall:result.reliability.overall,
    horizons:result.reliability.horizons,scheduler:result.reliability.scheduler,budget:result.reliability.budget,
    global:result.reliability.global,competitions:result.reliability.competitions.map(c=>({competition:c.competition,health:c.health,issues:c.issues})),providerRequests:0},null,2));
} catch(error) {
  // Never print a pg connection string, query parameters, or raw database error message.
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'AUDIT_FAILED';
  console.error(JSON.stringify({status:'FAIL',code}));process.exitCode=1;
} finally {await database.close();}
