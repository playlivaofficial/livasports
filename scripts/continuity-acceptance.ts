import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {continuityMetrics,type ContinuitySample} from '../src/odds/continuity';
import {readNativeCoverage,summarizeNative,type NativeCell} from '../src/odds/native-coverage';
import {budgetHealth} from '../src/odds/budget';
// Read-only acceptance: no provider adapter and no production writes.
const db=new PostgresDatabaseClient(databaseUrl()!);
const since=process.argv.find(a=>a.startsWith('--since='))?.slice(8)??'2026-09-21T11:53:00Z';
try{
 const baseline=JSON.parse(await readFile('output/continuity-before-private.json','utf8'));
 const ids=new Set<string>(baseline.coverage.fixtureIds);
 const coverage=await readNativeCoverage(db);
 const cells=coverage.cells.filter(c=>ids.has(c.fixtureId));
 const rows=await db.query('SELECT observed_at,cells FROM odds_continuity_samples WHERE observed_at >= $1 ORDER BY observed_at',[since]);
 const samples:ContinuitySample[]=rows.rows.map(r=>({at:new Date(r.observed_at).toISOString(),cells:(r.cells as NativeCell[]).filter(c=>ids.has(c.fixtureId))}));
 const cellKey=(c:NativeCell)=>[c.fixtureId,c.bookmaker,c.market,c.outcome].join('|');
 const currentByKey=new Map(cells.map(c=>[cellKey(c),c]));
 // The original pre-instrumentation baseline has no expiry field. Use the first
 // actual production sample, never reconstruct or invent its old timestamps.
 const pastOriginalExpiry=(samples[0]?.cells??[]).filter(c=>c.kind==='REAL'&&Date.parse(c.nativeExpiryAt??'')<Date.now());
 const expiryBoundary=pastOriginalExpiry.map(c=>({bookmaker:c.bookmaker,competition:c.competition,market:c.market,fixtureId:c.fixtureId,outcome:c.outcome,oldExpiry:c.nativeExpiryAt,current:currentByKey.get(cellKey(c))??null}));
 const transitions=samples.flatMap((s,i)=>i===0?[]:s.cells.flatMap(c=>{const p=samples[i-1].cells.find(p=>cellKey(p)===cellKey(c));return p?.kind==='REAL'&&c.kind!=='REAL'?[{at:s.at,...c}]:[];}));
 const jobs=(await db.query('SELECT id,started_at,completed_at,status,trigger_source,provider_requests,error_code,result FROM odds_sync_jobs WHERE started_at >= $1 ORDER BY started_at',[since])).rows;
 const requests=(await db.query('SELECT started_at,endpoint,safe_query,http_status,outcome,job_id FROM odds_provider_requests WHERE started_at >= $1 ORDER BY started_at',[since])).rows;
 const rescues=(await db.query("SELECT at,bookmaker,tournament_id,outcome,detail FROM odds_recovery_actions WHERE at >= $1 AND action='NATIVE_RESCUE' ORDER BY at",[since])).rows;
 const decisions=(await db.query('SELECT at,targets,budget FROM odds_scheduler_decisions WHERE at >= $1 ORDER BY at',[since])).rows;
 const catalog329=(await db.query("SELECT t FROM odds_provider_catalog c CROSS JOIN LATERAL jsonb_array_elements(c.tournaments) t WHERE c.provider='ODDSPAPI' AND t->>'tournamentId'='329'")).rows;
 const data={at:new Date().toISOString(),since,monitoringProviderRequests:0,cohort:{baseline:ids.size,current:coverage.fixtures,intersection:new Set(cells.map(c=>c.fixtureId)).size},
  before:summarizeNative(baseline.coverage.cells),after:summarizeNative(cells),counts:coverage.counts,delayCounts:coverage.delayCounts,
  samples:samples.map(s=>({at:s.at,groups:summarizeNative(s.cells).filter(g=>g.key.endsWith('|*|*|*'))})),
  continuity:continuityMetrics(samples),expiryBoundary,transitions,jobs,requests,rescues,decisions,catalog329,budget:await budgetHealth(db),unresolved:coverage.unresolvedIdentities};
 await writeFile('output/continuity-acceptance-private.json',JSON.stringify(data,null,2));
 console.log(JSON.stringify({...data,before:data.before.filter(g=>g.competition==='*'),after:data.after.filter(g=>g.competition==='*'),
  continuity:data.continuity.filter(g=>g.key==='*'||g.key.endsWith('|*|*|*')),jobs:jobs.map(({result,...job})=>({...job,resultSummary:result?.reason??null})),
  decisions:decisions.map(d=>({at:d.at,counts:(d.targets as Array<{decision:string}>).reduce((acc:Record<string,number>,t)=>(acc[t.decision]=(acc[t.decision]??0)+1,acc),{})}))}));
}finally{await db.close();}
