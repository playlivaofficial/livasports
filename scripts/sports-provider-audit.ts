import {writeFile,readFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {SportsAuditProvider,SportsProviderError} from '../src/sports/provider-audit';
import type {SportmonksSeasonPayload,SportmonksFixturePayload,SportmonksStandingPayload} from '../src/providers/sportmonks/types';
const db=new PostgresDatabaseClient(databaseUrl()!);
const reportFile='output/sports-provider-audit-private.json';
type Row={slug:string;league:string;seasons:SportmonksSeasonPayload[];seasonStatus:number;standings:number;standingStatus:number;scorers:number;scorerStatus:number;fixtureSample:number;fixtureStatus:number;lineups:number;statistics:number;events:number;};
const report:Row[]=JSON.parse(await readFile(reportFile,'utf8').catch(()=>'[]'));
const run=(await db.query<{id:string}>(`INSERT INTO ingestion_sync_runs(sync_kind,target_key,status) VALUES('SEASONS','SPORTS_CAPABILITY_AUDIT','RUNNING') RETURNING id`)).rows[0].id;
const provider=new SportsAuditProvider(process.env.SPORTMONKS_API_KEY!,db,run);
try{
  const competitions=(await db.query<{slug:string;league:string}>(`SELECT c.slug,m.provider_entity_id AS league FROM competitions c JOIN provider_entity_mappings m ON m.livasports_entity_id=c.id AND m.provider='SPORTMONKS' AND m.entity_type='COMPETITION' WHERE c.enabled ORDER BY c.priority_br,c.slug`)).rows;
  if(competitions.length!==34)throw new Error('Expected exactly 34 mapped competitions');
  for(const c of competitions){
    if(report.some(r=>r.slug===c.slug&&r.scorerStatus===200))continue;
    const seasons=await provider.all<SportmonksSeasonPayload>('football/seasons',{filters:`seasonLeagues:${c.league}`});
    if(seasons.data.some(s=>String(s.league_id)!==c.league))throw new Error('Provider season filter did not match');
    const current=seasons.data.find(s=>s.is_current)??[...seasons.data].sort((a,b)=>(b.starting_at??'').localeCompare(a.starting_at??''))[0];
    const standings=current?await provider.all<SportmonksStandingPayload>(`football/standings/seasons/${current.id}`,{include:'participant;details.type;stage;group;rule;form'}):null;
    const scorers=current?await provider.all(`football/topscorers/seasons/${current.id}`,{include:'player;participant;type'}):null;
    const fixtures=current?await provider.page<SportmonksFixturePayload>('football/fixtures',{filters:`fixtureSeasons:${current.id}`,include:'participants;state;scores;events.type;statistics.type;lineups',per_page:'50'}):null;
    const row:Row={...c,seasons:seasons.data,seasonStatus:seasons.status,standings:standings?.data.length??0,standingStatus:standings?.status??0,
      scorers:scorers?.data.length??0,scorerStatus:scorers?.status??0,fixtureSample:fixtures?.data.length??0,fixtureStatus:fixtures?.status??0,
      lineups:fixtures?.data.filter(f=>f.lineups?.length).length??0,statistics:fixtures?.data.filter(f=>f.statistics?.length).length??0,events:fixtures?.data.filter(f=>f.events?.length).length??0};
    const old=report.findIndex(r=>r.slug===c.slug);if(old>=0)report[old]=row;else report.push(row);
    await writeFile(reportFile,JSON.stringify(report,null,2));
    console.log(JSON.stringify({...row,seasons:row.seasons.length,providerRequests:provider.requests}));
  }
  await db.query(`UPDATE ingestion_sync_runs SET status='SUCCEEDED',completed_at=now(),metadata=$2 WHERE id=$1`,[run,JSON.stringify({competitions:report.length,readOnlySportsAudit:true})]);
}catch(error){
  const status=error instanceof SportsProviderError?error.status:null;
  console.error(JSON.stringify({status:'INCOMPLETE',httpStatus:status,completed:report.length,providerRequests:provider.requests}));
  await db.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),error_message=$2 WHERE id=$1`,[run,`Sports audit incomplete; HTTP ${status??'not applicable'}`]);process.exitCode=1;
}finally{await db.close();}
