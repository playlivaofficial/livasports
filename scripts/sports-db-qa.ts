import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl,type QueryExecutor} from '../src/database/client';
import {SportsRepository} from '../src/sports/repository';
import {PostgresProfileRepository} from '../src/profiles/repository';
import {PostgresMatchCenterRepository} from '../src/match-center/repository';
import {FOOTBALL_COMPETITION_TARGETS} from '../src/config/footballCompetitions';
import {SportsSitemapRepository} from '../src/sports/sitemap-repository';
import {sitemapBatchSize,sitemapKinds} from '../src/sports/sitemap';
import {sportStage,sportGroup} from '../src/sports/policy';
import {standingRule} from '../src/sports/standing-policy';
import {eventLabels,statisticLabels} from '../src/match-center/localization';
const url=databaseUrl();if(!url)throw Error('Sports database is not configured');
const db=new PostgresDatabaseClient(url);
let check='read-only transaction';
let localizationGaps:{stages:string[];groups:string[];rules:number[];events:string[];statistics:string[]}|null=null;
try{
  const report=await db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    assert.equal((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    check='stored sports localization';
    const labels=(await tx.query(`SELECT DISTINCT label FROM (SELECT stage_name AS label FROM fixtures UNION SELECT round_name FROM fixtures UNION SELECT stage_name FROM standings_current UNION SELECT stage_name FROM sports_pending_fixtures UNION SELECT round_name FROM sports_pending_fixtures UNION SELECT payload->'stage'->>'name' FROM sports_unlinked_competition_records WHERE capability='STANDINGS') names WHERE label IS NOT NULL`)).rows;
    const groups=(await tx.query(`SELECT group_name FROM standings_current WHERE group_name IS NOT NULL UNION SELECT payload->'group'->>'name' FROM sports_unlinked_competition_records WHERE capability='STANDINGS' AND payload->'group'->>'name' IS NOT NULL`)).rows;
    const rules=(await tx.query(`SELECT (provider_rule->>'type_id')::int AS id FROM standings_current WHERE provider_rule->>'type_id' ~ '^[0-9]+$' UNION SELECT (payload->'rule'->>'type_id')::int FROM sports_unlinked_competition_records WHERE capability='STANDINGS' AND payload->'rule'->>'type_id' ~ '^[0-9]+$'`)).rows;
    const eventTypes=(await tx.query('SELECT DISTINCT event_type FROM fixture_events')).rows;
    const statisticTypes=(await tx.query('SELECT DISTINCT statistic_type FROM fixture_statistics')).rows;
    localizationGaps={
      stages:labels.filter(row=>!sportStage('br',String(row.label))||!sportStage('mx',String(row.label))).map(row=>String(row.label)),
      groups:groups.filter(row=>!sportGroup('br',String(row.group_name))||!sportGroup('mx',String(row.group_name))).map(row=>String(row.group_name)),
      rules:rules.filter(row=>!(['br','mx','en'] as const).every(locale=>standingRule(locale,Number(row.id)))).map(row=>Number(row.id)),
      events:eventTypes.map(row=>String(row.event_type)).filter(type=>!eventLabels.br[type]||!eventLabels.mx[type]),
      statistics:statisticTypes.map(row=>String(row.statistic_type)).filter(type=>!statisticLabels.br[type]||!statisticLabels.mx[type]),
    };
    assert.equal(Object.values(localizationGaps).reduce((sum,values)=>sum+values.length,0),0);
    // One read-only transaction uses one connection; serialize the repository's parallel reads in this QA runner.
    let pending:Promise<unknown>=Promise.resolve();
    const serial:QueryExecutor={query:(text,values)=>{const next=pending.then(()=>tx.query(text,values));pending=next;return next as ReturnType<QueryExecutor['query']>;}};
    const repo=new SportsRepository(serial),matrix=[];
    const sitemaps=new SportsSitemapRepository(serial),sitemapCounts=await sitemaps.counts();
    for(const kind of sitemapKinds){
      check=`${kind} sitemap counts and pagination`;
      assert.ok(sitemapCounts[kind]>0);
      const first=await sitemaps.entries(kind,5),second=await sitemaps.entries(kind,5,5);
      assert.equal(first.length,Math.min(5,sitemapCounts[kind]));assert.ok(!second.some(row=>first.some(p=>p.publicId===row.publicId)));
      const offset=Math.floor((sitemapCounts[kind]-1)/sitemapBatchSize)*sitemapBatchSize;
      const last=await sitemaps.entries(kind,sitemapBatchSize,offset);assert.equal(last.length,sitemapCounts[kind]-offset);
      for(const row of [...first,...last]){assert.match(row.publicId,/^[a-f0-9]{16}$/);assert.ok(Number.isFinite(new Date(row.updatedAt).getTime()));}
    }
    for(const target of FOOTBALL_COMPETITION_TARGETS.filter(t=>t.enabled)){
      check=`${target.slug} competition read model`;
      const hub=await repo.competition(target.slug,'br',undefined,1);assert.ok(hub);assert.equal(hub.providerRequests,0);
      for(const f of [...hub.upcoming,...hub.results]){assert.equal(f.competitionSlug,target.slug);assert.equal(f.seasonId,hub.season?.id);assert.match(f.publicId,/^[a-f0-9]{16}$/);}
      assert.ok(hub.results.every(f=>f.status==='FINISHED'));assert.ok(hub.upcoming.every(f=>f.status!=='FINISHED'));
      assert.ok(hub.scorers.every(p=>p.goals>0&&p.rank>0));
      if(hub.counts.results>30){const next=await repo.competition(target.slug,'br',hub.season!.id,2);assert.ok(next);assert.ok(!next.results.some(f=>hub.results.some(first=>first.id===f.id)));}
      matrix.push({competition:target.slug,seasons:hub.seasons.length,fixtures:hub.counts.upcoming,results:hub.counts.results,standings:hub.standings.length,scorers:hub.scorers.length,teams:hub.teams.length,providerRequests:0,availability:hub.availability});
      console.log(JSON.stringify({phase:'competition',competition:target.slug,status:'PASS',providerRequests:0}));
    }
    assert.equal(matrix.length,34);
    check='valid global player identities';
    assert.equal((await tx.query(`SELECT count(*)::int AS invalid FROM player_provider_mappings WHERE provider='SPORTMONKS' AND provider_player_id !~ '^[1-9][0-9]*$'`)).rows[0].invalid,0);
    check='sports search';
    const search=await repo.search('Flamengo','en');assert.ok(search.some(r=>r.kind==='team'));
    assert.ok((await repo.search('Rossi','br')).some(r=>r.kind==='player'));
    assert.ok((await repo.search('Arsenal','en')).some(r=>r.kind==='team'));
    assert.equal((await repo.search('zzzzzzzzzzzzzz','mx')).length,0);
    check='profile and result consistency';
    const matchRepo=new PostgresMatchCenterRepository(serial as never),profiles=new PostgresProfileRepository(serial as never);
    const header=await matchRepo.header('a7ca59c522504409','br');assert.ok(header);
    const profile=await profiles.team(header.home.publicId,'br');assert.ok(profile);
    if(header.status==='FINISHED')assert.ok(!profile.upcoming.some(f=>f.id===header.id));
    const history=await repo.teamHistory(header.home.publicId,'br','results',1);const result=history.rows.find(f=>f.id===header.id);assert.ok(result);assert.equal(result.homeScore,header.homeScore);assert.equal(result.awayScore,header.awayScore);
    check='form and H2H';
    const form=await matchRepo.form(header);assert.ok([...form.home,...form.away,...form.headToHead].every(f=>Date.parse(f.kickoff)<Date.parse(header.kickoff)&&f.id!==header.id));
    check='events and card counts';
    const eventFixture=await matchRepo.header('ef0c579964fb4900','br');assert.ok(eventFixture);
    const events=await matchRepo.events(eventFixture.id);assert.ok(events.length>0);
    const cardFixture=await matchRepo.header('04f7061233e34ca4','br');assert.ok(cardFixture);
    const cardCounts=(await repo.redCards([cardFixture.id]))[cardFixture.id];assert.ok(cardCounts);
    assert.equal((cardCounts.home??0)+(cardCounts.away??0),1,'Second-yellow dismissals must not be counted twice');
    for(let i=1;i<events.length;i++){
      const previous=events[i-1],current=events[i];
      assert.ok((current.minute??Infinity)>=(previous.minute??Infinity),'Event minutes must be chronological');
      if(current.minute===previous.minute)assert.ok((current.extraMinute??0)>=(previous.extraMinute??0),'Stoppage-time events must be chronological');
    }
    assert.equal((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    return {status:'PASS',databaseReadOnly:true,providerRequests:0,competitions:matrix,search:'PASS',profileScoreConsistency:'PASS',historyPagination:'PASS',h2h:'PASS',eventChronology:'PASS',sitemaps:'PASS'};
  });
  await writeFile('output/sports-db-qa-private.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,competitions:report.competitions.length}));
}catch(error){
  await writeFile('output/sports-db-qa-failure-private.json',JSON.stringify({check,localizationGaps,providerRequests:0},null,2));
  console.error(JSON.stringify({status:'FAIL',check,reason:error instanceof assert.AssertionError?'Sports data assertion failed':'Sports QA execution failed',providerRequests:0,privateValuesLogged:false}));process.exitCode=1;
}
finally{await db.close();}
