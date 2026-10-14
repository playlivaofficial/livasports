/** Scoped GEO SEO operations. Loads only DB configuration; no odds/provider credentials or adapters. */
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient,type QueryExecutor} from '../src/database/client';
import {rankGrowthInventory,runGrowthSelection} from '../src/growth/service';
import {buildShortlist} from '../src/growth/shortlist';
import {readCountryDemand} from '../src/growth/country-demand-read';
import {readDailyGrowthReport} from '../src/growth/daily-repository';
import {CORE_GEOS} from '../src/config/geo';
import {refreshGrowthDiscovery} from '../src/growth/discovery-refresh';
const args=process.argv.slice(2),mode=args[0],envAt=args.indexOf('--db-env'),outputAt=args.indexOf('--output');
if(!['plan','report','migrate-plan','migrate','run','repeat'].includes(mode))throw Error('GEO_MODE_NOT_ALLOWED');
if(['migrate','run','repeat'].includes(mode)&&!args.includes('--apply'))throw Error('GEO_EXPLICIT_APPLY_REQUIRED');
const env=envAt>=0?parseEnv(await readFile(args[envAt+1],'utf8')):process.env;
const url=databaseUrl({DATABASE_URL:env.DATABASE_URL??env.DATABASE_POSTGRES_URL??env.POSTGRES_URL});
if(!url)throw Error('GEO_DATABASE_NOT_CONFIGURED');
const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:25000});
// Pool queries may run in parallel; a transaction's single pg client must execute sequentially.
function serialReader(tx:QueryExecutor){
 let previous:Promise<unknown>=Promise.resolve();
 const query:QueryExecutor['query']=(sql,values)=>{const next=previous.then(()=>tx.query(sql,values));previous=next.then(()=>undefined,()=>undefined);return next as ReturnType<QueryExecutor['query']>;};
 return {query,transaction:async<T>(fn:(tx:QueryExecutor)=>Promise<T>)=>fn({query}),close:async()=>{}} as DatabaseClient;
}
try{
 const now=new Date();let result:unknown;
 if(mode==='migrate'||mode==='migrate-plan'){
  let evidence:unknown;
  try{await db.transaction(async tx=>{
   if(mode==='migrate-plan')await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('growth:daily-seo-migration',0))");
   const baseline=(await tx.query('SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1')).rows[0]?.filename;
   if(!['070_geo_daily_seo.sql','071_geo_discovery_refresh.sql'].includes(String(baseline)))throw Error('UNEXPECTED_MIGRATION_BASELINE');
   const sql=await readFile(new URL('../db/migrations/071_geo_discovery_refresh.sql',import.meta.url),'utf8');
   await tx.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
   await tx.query("INSERT INTO schema_migrations(filename) VALUES('071_geo_discovery_refresh.sql') ON CONFLICT(filename) DO NOTHING");
   const tables=(await tx.query("SELECT column_name FROM information_schema.columns WHERE table_name='growth_geo_runs' ORDER BY ordinal_position")).rows;
   const reports=[];for(const geo of CORE_GEOS){const report=await readDailyGrowthReport(serialReader(tx),geo,now);if(!report)throw Error('DAILY_REPORT_REHEARSAL_FAILED');reports.push({geo,active:report.active.length,measurementRows:report.measurements.length});}
   let rehearsal:unknown=null;
   if(mode==='migrate-plan'){
    const reader=serialReader(tx),first=await runGrowthSelection(reader,'OWNER',{now}),second=await runGrowthSelection(reader,'OWNER',{now});
    const automatic=await runGrowthSelection(reader,'AUTOMATIC',{now});
    if(first.state!=='SUCCEEDED'||first.selectionCount!==15||second.state!=='SUCCEEDED'||second.geoResults?.some(r=>r.changed)||automatic.geoResults?.some(r=>r.state!=='SUCCEEDED'||r.changed)){
     console.error(JSON.stringify({phase:'rollback-rehearsal',first,second,automatic}));throw Error('DAILY_EXECUTION_REHEARSAL_FAILED');
    }
    const count=(await tx.query('SELECT geo,count(*)::int AS n,count(DISTINCT fixture_id)::int AS unique_count FROM growth_geo_priorities WHERE active GROUP BY geo ORDER BY geo')).rows;
    if(count.length!==3||count.some(r=>Number(r.n)!==5||Number(r.unique_count)!==5))throw Error('DAILY_FIVE_REHEARSAL_FAILED');
    const invalidated:string[]=[],discovery=await refreshGrowthDiscovery(reader,path=>{invalidated.push(path);});
    const discoveryRepeat=await refreshGrowthDiscovery(reader,()=>{throw Error('DUPLICATE_INVALIDATION');});
    if(discovery.runs!==3||discovery.paths<9||discoveryRepeat.runs!==0)throw Error('DISCOVERY_REHEARSAL_FAILED');
    rehearsal={first,second,automatic,counts:count,discovery,discoveryRepeat,invalidated,rolledBack:true};
   }
   evidence={migration:'071_geo_discovery_refresh.sql',baseline,columns:tables.map(r=>r.column_name),reportReads:reports,rehearsal,providerRequests:0};
   if(mode==='migrate-plan')throw Error('EXPECTED_ROLLBACK');
  });}catch(e){if(!(e instanceof Error)||e.message!=='EXPECTED_ROLLBACK')throw e;}
  result={mode,...evidence as object};
 }else if(mode==='plan'){
  result=await db.transaction(async tx=>{
   await tx.query('SET TRANSACTION READ ONLY');
   const reader=serialReader(tx);
   const geos=[];
   for(const geo of CORE_GEOS){const rows=await rankGrowthInventory(reader,now,geo),shortlist=buildShortlist(rows.map(r=>r.priority),{size:5}),ids=shortlist.content.map(r=>r.fixtureId);
    geos.push({geo,considered:rows.length,country:await readCountryDemand(reader,geo,now),selected:ids.map((id,index)=>{const r=rows.find(r=>r.signals.fixtureId===id)!;return {rank:index+1,score:r.priority.total,signals:r.signals,url:r.destinationUrl,breakdown:r.priority.lines,country:r.countrySearchEvidence};})});}
   return {generatedAt:now.toISOString(),mode,geos,providerRequests:0};
  });
 }else if(mode==='report'){
  result=await db.transaction(async tx=>{await tx.query('SET TRANSACTION READ ONLY');const reader=serialReader(tx);
   const geos=[];for(const geo of CORE_GEOS)geos.push({geo,report:await readDailyGrowthReport(reader,geo,now)});return {generatedAt:now.toISOString(),mode,geos,providerRequests:0};});
 }else{
  const first=await runGrowthSelection(db,'OWNER',{now});
  const second=mode==='repeat'?await runGrowthSelection(db,'OWNER',{now}):null;
  const automatic=mode==='repeat'?await runGrowthSelection(db,'AUTOMATIC',{now}):null;
  result={generatedAt:now.toISOString(),mode,first,second,automatic,providerRequests:0};
  if(first.state!=='SUCCEEDED'||(second&&second.state!=='SUCCEEDED')||(automatic&&automatic.state!=='SUCCEEDED'))process.exitCode=1;
 }
 if(outputAt>=0)await writeFile(args[outputAt+1],JSON.stringify(result,null,2));
 console.log(JSON.stringify(outputAt>=0?{mode,output:args[outputAt+1],providerRequests:0}:result,null,2));
}catch(error){console.error(JSON.stringify({error:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'GEO_OPERATION_FAILED',code:(error as {code?:string}).code??null}));process.exitCode=1;}
finally{await db.close();}
