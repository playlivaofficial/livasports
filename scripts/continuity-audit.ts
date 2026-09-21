import {writeFile,readFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {readNativeCoverage} from '../src/odds/native-coverage';
import {schedulerPlan} from '../src/odds/scheduler';
import {schedulerTournaments} from '../src/providers/oddspapi/tournament-catalog';
import {recordContinuity,readContinuity} from '../src/odds/continuity';
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
 const catalog=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0]?.tournaments??[];
 const coverage=await readNativeCoverage(db),plan=await schedulerPlan(db,new Date(),schedulerTournaments(catalog));
 if(process.argv.includes('--observe'))await recordContinuity(db,coverage.at,coverage.cells);
 if(process.argv.includes('--seed-baseline')){const before=JSON.parse(await readFile('output/continuity-before-private.json','utf8'));await recordContinuity(db,before.coverage.at,before.coverage.cells);}
 const continuity=await readContinuity(db);
 const unresolved=coverage.diagnostics.filter(d=>d.classification==='IDENTITY_UNRESOLVED');
 const target=(await db.query("SELECT * FROM odds_refresh_targets WHERE tournament_id='329'")).rows;
 const requests=(await db.query("SELECT started_at,safe_query,http_status,outcome FROM odds_provider_requests WHERE '329'=ANY(string_to_array(safe_query->>'tournamentIds',',')) ORDER BY started_at DESC LIMIT 12")).rows;
 const data={at:new Date().toISOString(),providerRequests:0,coverage,plan,continuity,unresolved,tournament329:{catalog:catalog.filter((t:Record<string,unknown>)=>String(t.tournamentId??t.id)==='329'),target,requests}};
 await writeFile(`output/continuity-${process.argv.includes('--before')?'before':'after'}-private.json`,JSON.stringify(data,null,2));
 console.log(JSON.stringify({at:data.at,fixtures:coverage.fixtures,summary:coverage.groups.filter(g=>g.competition==='*'),counts:coverage.counts,unresolved:coverage.unresolvedIdentities,continuity:{samples:continuity.samples,groups:continuity.groups.filter(g=>g.key==='*'||g.key.endsWith('|*|*|*'))},plan:plan.pacing,forecast:plan.cadence.projectedDailyRequests,peak:plan.cadence.peakDailyRequests,scale:plan.cadence.scale}));
}finally{await db.close();}
