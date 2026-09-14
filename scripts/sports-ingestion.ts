import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {writeSportsCheckpoint} from '../src/sports/checkpoint';
import {PostgresDatabaseClient,databaseUrl,type DatabaseClient} from '../src/database/client';
import {SportsAuditProvider,SportsProviderError,type SportsEnvelope} from '../src/sports/provider-audit';
import {capturedAll,capturedPage} from '../src/sports/captured-provider';
import {SportsIngestionStore,records,type ProviderRow} from '../src/sports/ingestion-store';
import {runSportsJobs} from '../src/sports/work-queue';
import {sportsStorageCapacity} from '../src/sports/storage-capacity';

const command=process.argv[2];
if(!['rehearse','migrate','populate','enrich','refresh-current'].includes(command))throw new Error('Use rehearse, migrate, populate, enrich, or refresh-current');
const db=new PostgresDatabaseClient(databaseUrl()!);
if(command==='populate'||command==='enrich'||command==='refresh-current'){
  const storage=await sportsStorageCapacity(db);
  if(!storage.ready){console.error(JSON.stringify({status:'PAUSED_STORAGE',...storage,providerRequests:0,completedCheckpointsRetained:true}));await db.close();process.exit(1);}
}
const migrations=['016_sports_competition_depth.sql','017_sports_pending_draws.sql','018_sports_pending_participants.sql','019_sports_unlinked_lineup_statistics.sql','020_sports_unlinked_competition_records.sql'];
const migrationSqls=await Promise.all(migrations.map(async filename=>({filename,sql:(await readFile(`db/migrations/${filename}`,'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'')})));
const run=(await db.query<{id:string}>(`INSERT INTO ingestion_sync_runs(sync_kind,target_key,status) VALUES('FIXTURES',$1,'RUNNING') RETURNING id`,[`SPORTS_DEPTH_${command.toUpperCase()}`])).rows[0].id;
const provider=new SportsAuditProvider(process.env.SPORTMONKS_API_KEY!,db,run,undefined,undefined,{refresh:command==='refresh-current'});
const store=new SportsIngestionStore(db);
const checkpointFile=command==='refresh-current'?'output/sports-refresh-current-checkpoint-private.json':'output/sports-ingestion-checkpoint-private.json';
const checkpoint=new Set<string>(command==='refresh-current'&&!process.argv.includes('--resume-refresh')?[]:JSON.parse(await readFile(checkpointFile,'utf8').catch(()=>'[]')));
let checkpointWrite=Promise.resolve();
const checkpointDone=async(key:string)=>{checkpoint.add(key);const snapshot=JSON.stringify([...checkpoint]);checkpointWrite=checkpointWrite.then(()=>writeSportsCheckpoint(checkpointFile,snapshot));await checkpointWrite;};
const failures:Array<Record<string,unknown>>=[];
let failureWrite=Promise.resolve();
const includeFixtures='participants;state;scores;round;stage;group;venue;events.type;statistics.type;lineups.details.type;formations;coaches';
const includeSquad='player.country;player.nationality;player.position;position;details.type';
const checkStorage=async()=>{if(!(await sportsStorageCapacity(db)).ready)throw Error('Sports storage headroom exhausted; completed checkpoints retained');};
try{
  const competitions=(await db.query<{id:string;slug:string;league:string}>(`SELECT c.id,c.slug,m.provider_entity_id AS league FROM competitions c JOIN provider_entity_mappings m ON m.livasports_entity_id=c.id AND m.provider='SPORTMONKS' AND m.entity_type='COMPETITION' WHERE c.enabled ORDER BY c.priority_br,c.slug`)).rows;
  assert.equal(competitions.length,34);
  if(command==='migrate'){
    await db.transaction(async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(71634016)');
      for(const migration of migrationSqls){const exists=await tx.query('SELECT filename FROM schema_migrations WHERE filename=$1',[migration.filename]);
      if(!exists.rowCount){await tx.query(migration.sql);await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[migration.filename]);}}
    });
    console.log(JSON.stringify({status:'PASS',migrations,commercialMigrationsApplied:0,providerRequests:0}));
  }else if(command==='enrich'){
    const seasons=(await db.query<{id:string;competition_id:string;league:string;provider_id:string;name:string}>(`SELECT s.id,s.competition_id,s.name,sm.provider_entity_id AS provider_id,lm.provider_entity_id AS league FROM seasons s JOIN competitions c ON c.id=s.competition_id AND c.enabled JOIN provider_entity_mappings sm ON sm.livasports_entity_id=s.id AND sm.provider='SPORTMONKS' AND sm.entity_type='SEASON' JOIN provider_entity_mappings lm ON lm.livasports_entity_id=c.id AND lm.provider='SPORTMONKS' AND lm.entity_type='COMPETITION' ORDER BY c.priority_br`)).rows.filter(s=>checkpoint.has(`${s.provider_id}:SQUADS`));
    await runSportsJobs(seasons,2,async s=>{
      const season={id:s.id,competitionId:s.competition_id,league:s.league,providerId:Number(s.provider_id),name:s.name};
      const teams=await provider.all<ProviderRow>(`football/teams/seasons/${s.provider_id}`,{include:'country;venue;statistics.details.type',filters:`teamStatisticSeasons:${s.provider_id}`});
      if(teams.status===200)await store.teamCatalogue(season,teams.data);
      for(let page=1;;page++){
        const response=await provider.page<ProviderRow>('football/fixtures',{filters:`fixtureSeasons:${s.provider_id}`,include:includeFixtures,per_page:'50',page:String(page)});
        if(response.status===200)await store.fixtureMetadata(season,response.data);
        if(!response.hasMore)break;
      }
    });
    console.log(JSON.stringify({status:'PASS',enrichedSeasons:seasons.length,liveScoresOverwritten:false,providerRequests:provider.requests}));
  }else if(command==='rehearse'){
    const c=competitions.find(c=>c.slug==='coppa-italia')!;
    const seasonRows=(await provider.all<ProviderRow>('football/seasons',{filters:`seasonLeagues:${c.league}`})).data;
    const s=seasonRows.find(s=>s.is_current)!;
    const fixtures=await provider.page<ProviderRow>('football/fixtures',{filters:`fixtureSeasons:${s.id}`,include:includeFixtures,per_page:'50',page:'1'});
    const pendingRows=fixtures.data.filter(r=>r.placeholder===true&&records(r.participants)[0]?.id===records(r.participants)[1]?.id).slice(0,2);
    const unlinkedFixture=fixtures.data.find(r=>records(r.lineups).some(l=>!l.player_id&&records(l.details).length));
    assert.ok(unlinkedFixture,'Rehearsal requires a captured unlinked lineup example');
    fixtures.data=[...new Map([...fixtures.data.filter(r=>records(r.lineups).length>0).slice(0,2),unlinkedFixture,...pendingRows].map(r=>[r.id,r])).values()];
    assert.ok(pendingRows.length);
    const standings=await provider.all<ProviderRow>(`football/standings/seasons/${s.id}`,{include:'participant;details.type;stage;group;rule;form'});
    const scorers=await provider.page<ProviderRow>(`football/topscorers/seasons/${s.id}`,{include:'player;participant;type',per_page:'10',page:'1'});
    const teams=await provider.all<ProviderRow>(`football/teams/seasons/${s.id}`,{include:'country;venue;statistics.details.type',filters:`teamStatisticSeasons:${s.id}`});
    const teamId=Number(records(fixtures.data[0]?.participants)[0]?.id);
    const squad=await provider.all<ProviderRow>(`football/squads/seasons/${s.id}/teams/${teamId}`,{include:includeSquad});
    assert.equal(fixtures.status,200);assert.equal(squad.status,200);assert.equal(scorers.status,200);
    const rollback=new Error('SPORTS_REHEARSAL_ROLLBACK');let passed=false;
    try{await db.transaction(async tx=>{
      for(const migration of migrationSqls)if(!(await tx.query('SELECT filename FROM schema_migrations WHERE filename=$1',[migration.filename])).rowCount)await tx.query(migration.sql);
      const nested:DatabaseClient={query:tx.query.bind(tx),transaction:async work=>work(tx),close:async()=>{}};
      const testStore=new SportsIngestionStore(nested);
      const contexts=await testStore.seasons(c.id,c.league,seasonRows);const context=contexts.find(c=>c.providerId===s.id)!;
      for(let repeat=0;repeat<2;repeat++){
        await testStore.teamCatalogue(context,teams.data);await testStore.standings(context,standings.data);
        await testStore.scorers(context,scorers.data);await testStore.squad(context,teamId,squad.data);await testStore.fixtures(context,fixtures.data);
      }
      const count=(await tx.query<{n:number}>('SELECT count(*)::int AS n FROM season_topscorers WHERE season_id=$1',[context.id])).rows[0].n;
      assert.equal(count,scorers.data.length);
      const expectedUnlinked=fixtures.data.flatMap(f=>records(f.lineups).filter(l=>!l.player_id&&records(l.details).length));
      const unlinked=(await tx.query<{provider_lineup_id:string;unlinked_statistics:unknown;player_entity_id:string|null}>(`SELECT provider_lineup_id,unlinked_statistics,player_entity_id FROM fixture_lineups WHERE provider_lineup_id=ANY($1::bigint[])`,[expectedUnlinked.map(l=>l.id)])).rows;
      assert.equal(unlinked.length,expectedUnlinked.length);
      for(const row of unlinked){assert.equal(row.player_entity_id,null);assert.deepEqual(row.unlinked_statistics,expectedUnlinked.find(l=>String(l.id)===row.provider_lineup_id)!.details);}
      const detail=(await tx.query<{n:number}>('SELECT count(*)::int AS n FROM fixture_lineups fl JOIN fixtures f ON f.id=fl.fixture_id WHERE f.season_id=$1',[context.id])).rows[0].n;
      assert.ok(detail>0);assert.equal((await tx.query('SELECT count(*)::int AS n FROM sports_pending_fixtures WHERE provider_fixture_id=ANY($1::bigint[])',[pendingRows.map(r=>r.id)])).rows[0].n,pendingRows.length);passed=true;throw rollback;
    });}catch(error){if(error!==rollback)throw error;}
    assert.ok(passed);console.log(JSON.stringify({status:'PASS',rollback:true,idempotency:'PASS',mapping:'PASS',fixtureDetails:'PASS',squadStatistics:'PASS',providerRequests:provider.requests}));
  }else{
    for(const migration of migrations)assert.equal((await db.query('SELECT filename FROM schema_migrations WHERE filename=$1',[migration])).rowCount,1,'Sports migration required');
    const queue:Array<{slug:string;season:Awaited<ReturnType<SportsIngestionStore['seasons']>>[number];current:boolean;start:string}>=[];
    for(const c of competitions){
      const response=await provider.all<ProviderRow>('football/seasons',{filters:`seasonLeagues:${c.league}`});
      assert.equal(response.status,200);
      const seasons=await store.seasons(c.id,c.league,response.data);
      for(const season of seasons){const r=response.data.find(r=>r.id===season.providerId)!;if(command==='refresh-current'&&r.is_current!==true)continue;queue.push({slug:c.slug,season,current:r.is_current===true,start:String(r.starting_at??'')});}
    }
    queue.sort((a,b)=>Number(b.current)-Number(a.current)||b.start.localeCompare(a.start));
    console.log(JSON.stringify({phase:'catalogue',competitions:34,seasons:queue.length}));
    await runSportsJobs(queue,3,async item=>{
      const {season,slug}=item,prefix=String(season.providerId);
      let capability='STORAGE',endpoint:string|null=null,httpStatus:number|null=null,sourcePage:number|null=null;
      let seasonTeams:SportsEnvelope<ProviderRow>|undefined;
      try{
      await checkStorage();
      for(const capability of ['STANDINGS','SCORERS','TEAMS'] as const){
        const key=`${prefix}:${capability}`;if(checkpoint.has(key))continue;
        const path=capability==='STANDINGS'?`football/standings/seasons/${prefix}`:capability==='SCORERS'?`football/topscorers/seasons/${prefix}`:`football/teams/seasons/${prefix}`;
        const query:Record<string,string>=capability==='STANDINGS'?{include:'participant;details.type;stage;group;rule;form'}:capability==='SCORERS'?{include:'player;participant;type'}:{include:'country;venue;statistics.details.type',filters:`teamStatisticSeasons:${prefix}`};
        endpoint=path;httpStatus=null;sourcePage=null;
        const response=await provider.all<ProviderRow>(path,query);httpStatus=response.status;
        if(![200,403,404].includes(response.status))throw new SportsProviderError(response.status);
        if(capability==='TEAMS')seasonTeams=response;
        const persisted=response.status!==200?0:capability==='STANDINGS'?await store.standings(season,response.data):capability==='SCORERS'?await store.scorers(season,response.data):await store.teamCatalogue(season,response.data);
        await store.coverage(season,capability,response.status,response.data.length,persisted);await checkpointDone(key);
      }
      if(!checkpoint.has(`${prefix}:FIXTURES`)){
        capability='FIXTURES';endpoint='football/fixtures';
        let total=0,page=1;const seen=new Set<number>();
        for(;;){
          await checkStorage();
          sourcePage=page;httpStatus=null;
          const pageKey=`${prefix}:FIXTURE_PAGE:${page}`;
          const query={filters:`fixtureSeasons:${prefix}`,include:includeFixtures,per_page:'50',page:String(page)};
          const response=checkpoint.has(pageKey)?await capturedPage('football/fixtures',query):await provider.page<ProviderRow>('football/fixtures',query);httpStatus=response.status;
          if(![200,403,404].includes(response.status))throw new SportsProviderError(response.status);
          if(response.data.some(r=>seen.has(Number(r.id))))throw new Error('Fixture pagination repeated an identity');
          for(const r of response.data)seen.add(Number(r.id));
          if(!checkpoint.has(pageKey)&&response.status===200){await store.fixtures(season,response.data);await checkpointDone(pageKey);}
          total+=response.data.length;
          await store.coverage(season,'FIXTURES',response.status,total,total,!response.hasMore);
          if(!response.hasMore){await checkpointDone(`${prefix}:FIXTURES`);break;}assert.ok(response.data.length);page++;
        }
      }
      if(!checkpoint.has(`${prefix}:SQUADS`)){
        capability='SQUADS';endpoint=`football/teams/seasons/${prefix}`;httpStatus=null;sourcePage=null;
        // Completed units keep their original captured evidence, including during refresh resumption.
        // Reusing this response also avoids requesting the same fresh team catalogue twice.
        const teams=seasonTeams??await capturedAll(`football/teams/seasons/${prefix}`,{include:'country;venue;statistics.details.type',filters:`teamStatisticSeasons:${prefix}`});
        let total=0,stats=0;const unavailableTeams:Array<{providerTeamId:number;httpStatus:number}>=[];
        for(const team of teams.data){
          await checkStorage();
          endpoint=`football/squads/seasons/${prefix}/teams/${team.id}`;httpStatus=null;
          const key=`${prefix}:SQUAD:${team.id}`;
          const response=checkpoint.has(key)?await capturedAll(endpoint,{include:includeSquad}):await provider.all<ProviderRow>(endpoint,{include:includeSquad});httpStatus=response.status;
          if(![200,403,404].includes(response.status))throw new SportsProviderError(response.status);
          if(response.status!==200){unavailableTeams.push({providerTeamId:Number(team.id),httpStatus:response.status});if(!checkpoint.has(key))await checkpointDone(key);continue;}
          total+=response.data.length;stats+=response.data.reduce((sum,r)=>sum+records(r.details).length,0);
          if(!checkpoint.has(key)){await store.squad(season,Number(team.id),response.data);await checkpointDone(key);}
        }
        await store.coverage(season,'SQUADS',200,total,total,true,{unavailableTeams});
        await store.coverage(season,'PLAYER_STATISTICS',200,stats,stats,true,{unavailableTeams});
        await checkpointDone(`${prefix}:SQUADS`);
      }
      console.log(JSON.stringify({phase:'season',slug,season:season.name,complete:checkpoint.has(`${prefix}:SQUADS`),providerRequests:provider.requests}));
      }catch(error){
        const status=error instanceof SportsProviderError?error.status:httpStatus;
        const code=error&&typeof error==='object'&&'code' in error?String(error.code):null;
        const sourceCapability=endpoint?.includes('/standings/')?'STANDINGS':endpoint?.includes('/topscorers/')?'SCORERS':endpoint?.includes('/teams/')&&capability!=='SQUADS'?'TEAMS':capability;
        const message=error instanceof Error?error.message.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi,'[private endpoint]').replaceAll(process.env.SPORTMONKS_API_KEY??'__unused_secret__','[private credential]').slice(0,1200):'Unknown sports ingestion error';
        const fatal=(error instanceof SportsProviderError&&([0,401,429].includes(error.status)||error.status>=500))||['ENOSPC','EPERM','EBUSY','53100','53200'].includes(code??'')||/^(08|28)/.test(code??'')||message.startsWith('Sports storage');
        failures.push({competition:slug,season:season.name,capability:sourceCapability,endpoint,page:sourcePage,httpStatus:status,errorCode:code,error:message,retry:status===429?'after provider reset':fatal?'after shared resource recovery':'after season-specific error correction',genuinelyUnavailable:false,otherSeasonsContinue:!fatal});
        const snapshot=JSON.stringify(failures);failureWrite=failureWrite.then(()=>writeSportsCheckpoint(`output/sports-ingestion-failures-${run}-private.json`,snapshot));await failureWrite;
        console.error(JSON.stringify({phase:'season-failed',competition:slug,season:season.name,capability:sourceCapability,httpStatus:status,errorCode:code,otherSeasonsContinue:!fatal}));
        if(fatal)throw error;
      }
    });
    if(failures.length)throw new Error('Season ingestion has unresolved failures; successful checkpoints preserved');
  }
  await db.query(`UPDATE ingestion_sync_runs SET status='SUCCEEDED',completed_at=now(),metadata=$2 WHERE id=$1`,[run,JSON.stringify({command,checkpointTasks:checkpoint.size,rateLimits:provider.rateLimits()})]);
}catch(error){
  const status=error instanceof SportsProviderError?error.status:null;
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):null;
  const resourceFailure=['53100','53200'].includes(code??'')&&error instanceof Error?error.message.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi,'[private endpoint]'):null;
  const failure=error instanceof Error&&/^(Fixture|Season|Scorer|Squad|Standings|Sports storage|Unmapped|Invalid Sportmonks|Provider pagination|Cannot (read|convert)|Unsupported|out of memory|invalid memory alloc)/i.test(error.message)?error.message:null;
  const assertion=error instanceof assert.AssertionError?error.message:null;
  const constraint=error&&typeof error==='object'&&'constraint' in error&&typeof error.constraint==='string'&&/^[a-z0-9_]+$/.test(error.constraint)?error.constraint:null;
  console.error(JSON.stringify({status:'INCOMPLETE',command,httpStatus:status,databaseCode:code,constraint,failure,resourceFailure,assertion,providerRequests:provider.requests}));
  await db.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),error_message=$2,metadata=$3 WHERE id=$1`,[run,`Sports ingestion incomplete; HTTP ${status??'-'}; database ${code??'-'}`,JSON.stringify({command,checkpointTasks:checkpoint.size,failedSeasons:failures.length,rateLimits:provider.rateLimits()})]);process.exitCode=1;
}finally{await db.close();}
