// Read-only baseline plus a rolled-back migration/integration rehearsal.
import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readSlipComparison} from '../src/odds/read-repository';
import {ComparisonLoader} from '../src/slip/comparison-loader';
import {parseComparisonEvent,recordComparisonEvent} from '../src/slip/comparison-analytics-server';
import {SLIP_SCOPE,type CanonicalSelection} from '../src/slip/types';
const db=new PostgresDatabaseClient(databaseUrl()!);const checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
function check(name:string,pass:boolean,detail?:unknown){checks.push({name,pass,detail});if(!pass)throw new Error(name);}
async function baseline(){return (await db.query(`SELECT
  (SELECT count(*) FROM competitions WHERE enabled) AS competitions,(SELECT count(*) FROM fixtures) AS fixtures,
  (SELECT count(*) FROM teams) AS teams,(SELECT count(*) FROM players) AS players,
  (SELECT count(*) FROM odds_current) AS quotes,(SELECT count(*) FROM odds_history) AS history,
  (SELECT count(*) FROM odds_provider_requests) AS odds_http,
  (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests,
  (SELECT count(*) FROM odds_sync_jobs WHERE status='RUNNING') AS running_jobs,
  (SELECT count(*) FROM odds_sync_snapshots WHERE applied_at IS NULL) AS pending_snapshots,
  (SELECT count(*) FROM odds_current o LEFT JOIN fixtures f ON f.id=o.fixture_id WHERE f.id IS NULL) AS orphan_quotes,
  (SELECT count(*) FROM (SELECT fixture_id,bookmaker_id,market_code,outcome_code,line,count(*) FROM odds_current GROUP BY 1,2,3,4,5 HAVING count(*)>1) d) AS duplicate_quotes`)).rows[0];}
try{
  const before=await baseline();check('34 competition registry',before.competitions==='34');
  check('no running odds job, pending snapshot, orphan or duplicate quote',[before.running_jobs,before.pending_snapshots,before.orphan_quotes,before.duplicate_quotes].every(v=>v==='0'));
  const ids=(await db.query(`SELECT f.public_id FROM fixtures f WHERE status='SCHEDULED' AND kickoff>now() AND EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id) ORDER BY kickoff LIMIT 10`)).rows.map(r=>r.public_id);
  check('ten real retained quote fixtures available',ids.length===10);
  const selections:CanonicalSelection[]=ids.map(fixturePublicId=>({fixturePublicId,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null}));
  const sql=(await readFile('db/migrations/011_m7_full_slip_comparison.sql','utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
  try{await db.transaction(async tx=>{
    await tx.query("SET LOCAL lock_timeout='5s'");await tx.query(sql);
    const statements:string[]=[];const counted={query:async(text:string,values?:readonly unknown[])=>{statements.push(text);return tx.query(text,values);}};
    const metrics:unknown[]=[];const loader=new ComparisonLoader((ids,locale)=>readSlipComparison(counted,ids,locale),Date.now,event=>metrics.push(event));
    const result=await loader.resolve(selections,'br');const repeated=await loader.resolve([...selections].reverse(),'br');
    check('10 selections two bounded queries, cache repeat zero',statements.length===2,{queryCount:statements.length,metrics});
    check('Betsson and Betano BR independently odds eligible',result.comparison.bookmakers.length===2&&result.comparison.bookmakers.every(b=>b.geoEligibility.eligible));
    check('destinations configuration-gated without downgrading odds',result.comparison.bookmakers.every(b=>b.ctaState!=='ENABLED'),result.comparison.bookmakers.map(b=>({bookmaker:b.bookmakerId,coverage:b.availableSelectionCount,complete:b.complete,affiliate:b.affiliateEligibility})));
    check('no mixed or stale totals',result.comparison.bookmakers.every(b=>b.complete?b.selectionQuotes.every(q=>q.decimalOdds!==null):b.combinedDecimalOdds===null));
    check('display order distinct from cache identity',repeated.selections[0].selection.fixturePublicId===selections.at(-1)!.fixturePublicId);
    const mx=await loader.resolve(selections,'mx');check('MX has separately gated empty eligible set',mx.comparison.bookmakers.length===0);
    const plan=await tx.query(`EXPLAIN (ANALYZE,FORMAT JSON) ${statements[0]}`,[ids,'BR']);
    const parsed=plan.rows[0]['QUERY PLAN'][0];check('bounded current-quote query executes',parsed['Execution Time']<2000,{executionMs:parsed['Execution Time'],planningMs:parsed['Planning Time'],plan:parsed.Plan});
    const eventId=crypto.randomUUID(),event=parseComparisonEvent({eventId,eventName:'slip_comparison_view',locale:'br',placement:'slip-comparison',selectionCount:10,marketsSummary:{MATCH_WINNER:10,TOTAL_GOALS:0,BTTS:0}})!;
    await recordComparisonEvent(tx,event);await recordComparisonEvent(tx,event);
    check('M7 aggregate event is idempotent with additive schema',(await tx.query('SELECT count(*) AS n FROM product_events WHERE event_id=$1',[eventId])).rows[0].n==='1');
    const old=crypto.randomUUID();await tx.query("INSERT INTO product_events(event_id,event_name,locale,placement) VALUES($1,'slip_open','br','guest-slip')",[old]);
    check('M6 analytics remains compatible',true);
    throw new Error('EXPECTED_QA_ROLLBACK');
  });}catch(error){if(!(error instanceof Error)||error.message!=='EXPECTED_QA_ROLLBACK')throw error;}
  const after=await baseline();check('rollback preserves live data and zero provider requests',JSON.stringify(before)===JSON.stringify(after),{before,after});
  check('M7 migration not applied to live schema',(await db.query("SELECT count(*) AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='product_events' AND column_name='selection_count'")).rows[0].n==='0');
  const result={at:new Date().toISOString(),mode:'ROLLED_BACK_DATABASE_REHEARSAL',status:'PASS',checks};await writeFile('output/m7-db-qa-private.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,checks:checks.map(c=>({...c,detail:c.name.startsWith('bounded current')?{planSaved:true}:c.detail}))}));
}catch(error){console.error(JSON.stringify({status:'FAIL',error:error instanceof Error?error.message:'UNKNOWN',checks:checks.map(c=>({name:c.name,pass:c.pass}))}));process.exitCode=1;}finally{await db.close();}
