import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {capturedPage} from '../src/sports/captured-provider';
import {records} from '../src/sports/ingestion-store';
import {fixtureFormationSources} from '../src/sports/source-integrity';

// Offline additive repair after population. No gateway, HTTP, score updates, or inferred player identities.
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  assert.equal((await db.query('SELECT filename FROM schema_migrations WHERE filename=$1',['019_sports_unlinked_lineup_statistics.sql'])).rowCount,1);
  const onlyGaps=process.argv[2]==='--audit-gaps';
  const audit=onlyGaps?JSON.parse(await readFile('output/sports-coverage-matrix-private.json','utf8')) as {coverage:Array<{slug:string;season:string;capability:string;missing:number}>}:null;
  const missing=new Set(audit?.coverage.filter(r=>r.capability==='UNLINKED_LINEUP_STATISTICS'&&r.missing>0).map(r=>`${r.slug}:${r.season}`));
  const seasons=(await db.query<{id:string;name:string;slug:string;provider_id:string}>(`SELECT s.id,s.name,c.slug,m.provider_entity_id AS provider_id FROM seasons s JOIN competitions c ON c.id=s.competition_id AND c.enabled JOIN provider_entity_mappings m ON m.livasports_entity_id=s.id AND m.provider='SPORTMONKS' AND m.entity_type='SEASON' WHERE ($1::text IS NULL OR c.slug=$1) AND (SELECT count(*)=6 AND bool_and(status IN ('AVAILABLE','EMPTY','UNAVAILABLE')) FROM sports_season_coverage WHERE season_id=s.id) ORDER BY c.priority_br,s.starts_at DESC`,[onlyGaps?null:process.argv[2]??null])).rows.filter(s=>!onlyGaps||missing.has(`${s.slug}:${s.name}`));
  if(!onlyGaps)assert.ok(seasons.length,'No completed seasons matched');
  let unlinkedLineups=0,formations=0,removedInvalidAssociations=0;
  for(const season of seasons){
    for(let page=1;;page++){
      const response=await capturedPage('football/fixtures',{filters:`fixtureSeasons:${season.provider_id}`,include:'participants;state;scores;round;stage;group;venue;events.type;statistics.type;lineups.details.type;formations;coaches',per_page:'50',page:String(page)});
      if(response.status!==200){assert.ok([403,404].includes(response.status));break;}
      const confirmed=response.data.filter(r=>!r.placeholder&&r.starting_at&&records(r.participants).length===2&&records(r.participants)[0].id!==records(r.participants)[1].id);
      const lineups=confirmed.flatMap(f=>records(f.lineups).filter(l=>!l.player_id&&records(l.details).length).map(l=>({fixture:String(f.id),lineup:l.id,details:l.details})));
      const validFormations=confirmed.flatMap(f=>fixtureFormationSources(f).accepted.map(r=>({fixture:String(f.id),team:String(r.participant_id),formation:r.formation})));
      await db.transaction(async tx=>{
        if(lineups.length)unlinkedLineups+=(await tx.query(`UPDATE fixture_lineups fl SET unlinked_statistics=x.details,observed_at=now() FROM jsonb_to_recordset($1::jsonb) x(fixture text,lineup bigint,details jsonb),fixtures f,provider_entity_mappings fm WHERE fl.fixture_id=f.id AND f.season_id=$2 AND fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=x.fixture AND fl.provider_lineup_id=x.lineup AND fl.player_entity_id IS NULL AND fl.unlinked_statistics IS NULL`,[JSON.stringify(lineups),season.id])).rowCount??0;
        for(const table of ['fixture_formations','fixture_coaches'] as const)removedInvalidAssociations+=(await tx.query(`DELETE FROM ${table} d USING fixtures f,provider_entity_mappings fm WHERE d.fixture_id=f.id AND f.season_id=$1 AND fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=ANY($2::text[]) AND d.team_id NOT IN (f.home_team_id,f.away_team_id)`,[season.id,confirmed.map(f=>String(f.id))])).rowCount??0;
        if(validFormations.length)formations+=(await tx.query(`INSERT INTO fixture_formations(fixture_id,team_id,formation) SELECT f.id,tm.livasports_entity_id,x.formation FROM jsonb_to_recordset($1::jsonb) x(fixture text,team text,formation text) JOIN provider_entity_mappings fm ON fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' AND fm.provider_entity_id=x.fixture JOIN fixtures f ON f.id=fm.livasports_entity_id AND f.season_id=$2 JOIN provider_entity_mappings tm ON tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' AND tm.provider_entity_id=x.team AND tm.livasports_entity_id IN (f.home_team_id,f.away_team_id) ON CONFLICT(fixture_id,team_id) DO NOTHING`,[JSON.stringify(validFormations),season.id])).rowCount??0;
      });
      if(!response.hasMore)break;
    }
  }
  console.log(JSON.stringify({status:'PASS',seasons:seasons.length,unlinkedLineups,formations,removedInvalidAssociations,providerRequests:0,scoresOverwritten:false}));
}catch{console.error('Sports detail repair incomplete; private values were not logged.');process.exitCode=1;}
finally{await db.close();}
