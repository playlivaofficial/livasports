import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {records,object,type ProviderRow} from '../src/sports/ingestion-store';
import {fixtureCoachSources,fixtureFormationSources,fixtureLineupSources} from '../src/sports/source-integrity';
import {capturedAll} from '../src/sports/captured-provider';
const fixtureInclude='participants;state;scores;round;stage;group;venue;events.type;statistics.type;lineups.details.type;formations;coaches';
const squadInclude='player.country;player.nationality;player.position;position;details.type';
const db=new PostgresDatabaseClient(databaseUrl()!);
const currentOnly=process.argv.includes('--current-only');
type Season={id:string;name:string;slug:string;competition:string;provider_id:string;is_current:boolean};
type Coverage={season:string;slug:string;current:boolean;capability:string;provider:number;stored:number;missing:number;httpStatus:number|null;reason:string|null};
try{
  const result=await db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');assert.equal((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    const snapshotAt=new Date((await tx.query<{at:Date}>('SELECT transaction_timestamp() AS at')).rows[0].at).toISOString();
    const seasons=(await tx.query<Season>(`SELECT s.id,s.name,s.is_current,c.slug,c.canonical_name AS competition,m.provider_entity_id AS provider_id FROM seasons s JOIN competitions c ON c.id=s.competition_id JOIN provider_entity_mappings m ON m.livasports_entity_id=s.id AND m.provider='SPORTMONKS' AND m.entity_type='SEASON' WHERE c.enabled ORDER BY c.priority_br,s.is_current DESC,s.starts_at DESC`)).rows;
    const coverage:Coverage[]=[];
    const sourceConflicts:Array<{slug:string;season:string;capability:string;records:number;reason:string}>=[];
    const compare=(s:Season,capability:string,expected:unknown[],actual:unknown[],status=200,reason:string|null=null)=>{
      const wanted=new Set(expected.map(String)),known=new Set(actual.map(String));
      const absence=reason??(status===403?'Provider denied this capability (HTTP 403)':status===404?'Provider returned not found (HTTP 404)':status===200&&!wanted.size?'No records in the captured provider response':null);
      coverage.push({season:s.name,slug:s.slug,current:s.is_current,capability,provider:wanted.size,stored:known.size,missing:[...wanted].filter(id=>!known.has(id)).length,httpStatus:status,reason:absence});
    };
    const auditedSeasons=seasons.filter(s=>!currentOnly||s.is_current);
    for(const s of auditedSeasons){
      try{
        const states=(await tx.query<{capability:string;status:string}>('SELECT capability,status FROM sports_season_coverage WHERE season_id=$1',[s.id])).rows;
        if(states.length!==6||states.some(r=>['INCOMPLETE','ERROR'].includes(r.status)))coverage.push({season:s.name,slug:s.slug,current:s.is_current,capability:'INGESTION',provider:1,stored:0,missing:1,httpStatus:null,reason:'Season ingestion is incomplete'});
        const fixtures=await capturedAll('football/fixtures',{filters:`fixtureSeasons:${s.provider_id}`,include:fixtureInclude});
        const storedFixtures=(await tx.query<{provider_id:string}>(`SELECT m.provider_entity_id AS provider_id FROM provider_entity_mappings m WHERE m.provider='SPORTMONKS' AND m.entity_type='FIXTURE' AND (EXISTS(SELECT 1 FROM fixtures f WHERE f.id=m.livasports_entity_id AND f.season_id=$1) OR EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=m.livasports_entity_id AND p.season_id=$1))`,[s.id])).rows;
        compare(s,'FIXTURES',fixtures.data.map(r=>r.id),storedFixtures.map(r=>r.provider_id),fixtures.status);
        const confirmed=fixtures.data.filter(r=>r.placeholder!==true&&records(r.participants).length===2&&records(r.participants)[0].id!==records(r.participants)[1].id&&r.starting_at);
        const pending=fixtures.data.filter(r=>!confirmed.includes(r));
        compare(s,'PENDING',pending.map(r=>r.id),(await tx.query<{provider_fixture_id:string}>('SELECT provider_fixture_id FROM sports_pending_fixtures WHERE season_id=$1',[s.id])).rows.map(r=>r.provider_fixture_id));
        for(const [include,table,column] of [['events','fixture_events','provider_event_id'],['statistics','fixture_statistics','provider_statistic_id'],['lineups','fixture_lineups','provider_lineup_id']] as const){
          compare(s,include.toUpperCase(),confirmed.flatMap(f=>(include==='lineups'?fixtureLineupSources(f).accepted:records(f[include])).map(r=>r.id)),(await tx.query<{provider_id:string}>(`SELECT d.${column} AS provider_id FROM ${table} d JOIN fixtures f ON f.id=d.fixture_id WHERE f.season_id=$1`,[s.id])).rows.map(r=>r.provider_id));
        }
        const rejectedLineups=confirmed.flatMap(f=>fixtureLineupSources(f).rejected);
        if(rejectedLineups.length)sourceConflicts.push({slug:s.slug,season:s.name,capability:'LINEUPS_IDENTITY',records:rejectedLineups.length,reason:'Provider lineup team references neither match participant; captured source retained, never reassigned to another club'});
        const rejectedPlayerStatistics=rejectedLineups.reduce((sum,l)=>sum+records(l.details).length,0);
        if(rejectedPlayerStatistics)sourceConflicts.push({slug:s.slug,season:s.name,capability:'MATCH_PLAYER_STATISTICS_IDENTITY',records:rejectedPlayerStatistics,reason:'Player statistics belong to source lineups with contradictory team identity; captured source retained'});
        for(const table of ['fixture_lineups','fixture_player_statistics']){
          const invalid=Number((await tx.query(`SELECT count(*)::int AS count FROM ${table} d JOIN fixtures f ON f.id=d.fixture_id WHERE f.season_id=$1 AND d.team_id NOT IN (f.home_team_id,f.away_team_id)`,[s.id])).rows[0].count);
          if(invalid)coverage.push({season:s.name,slug:s.slug,current:s.is_current,capability:table==='fixture_lineups'?'LINEUP_ASSOCIATION':'PLAYER_STATISTIC_ASSOCIATION',provider:0,stored:invalid,missing:invalid,httpStatus:200,reason:'Stored team association does not match either fixture participant'});
        }
        compare(s,'SCORES',confirmed.flatMap(f=>records(f.scores).map(r=>`${f.id}:${r.id}`)),(await tx.query<{key:string}>(`SELECT fm.provider_entity_id || ':' || d.provider_score_id AS key FROM fixture_scores d JOIN fixtures f ON f.id=d.fixture_id JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' WHERE f.season_id=$1`,[s.id])).rows.map(r=>r.key));
        const rejectedFormations=confirmed.reduce((sum,f)=>sum+fixtureFormationSources(f).rejected.length,0);
        if(rejectedFormations)sourceConflicts.push({slug:s.slug,season:s.name,capability:'FORMATIONS',records:rejectedFormations,reason:'Provider formation references neither fixture participant; not reassigned by guesswork'});
        compare(s,'FORMATIONS',confirmed.flatMap(f=>fixtureFormationSources(f).accepted.map(r=>`${f.id}:${r.participant_id}`)),(await tx.query<{key:string}>(`SELECT fm.provider_entity_id || ':' || tm.provider_entity_id AS key FROM fixture_formations d JOIN fixtures f ON f.id=d.fixture_id JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' JOIN provider_entity_mappings tm ON tm.livasports_entity_id=d.team_id AND tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' WHERE f.season_id=$1`,[s.id])).rows.map(r=>r.key));
        compare(s,'MATCH_PLAYER_STATISTICS',confirmed.flatMap(f=>fixtureLineupSources(f).accepted.filter(l=>l.player_id).flatMap(l=>records(l.details).filter(d=>Object.keys(object(d.value??d.data)).length).map(d=>`${f.id}:${l.player_id}:${d.type_id}`))),(await tx.query<{key:string}>(`SELECT fm.provider_entity_id || ':' || pm.provider_player_id || ':' || d.provider_type_id AS key FROM fixture_player_statistics d JOIN fixtures f ON f.id=d.fixture_id JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' JOIN player_provider_mappings pm ON pm.player_id=d.player_id AND pm.provider='SPORTMONKS' WHERE f.season_id=$1`,[s.id])).rows.map(r=>r.key));
        compare(s,'UNLINKED_LINEUP_STATISTICS',confirmed.flatMap(f=>fixtureLineupSources(f).accepted.filter(l=>!l.player_id).flatMap(l=>records(l.details).filter(d=>Object.keys(object(d.value??d.data)).length).map(d=>`${f.id}:${l.id}:${d.type_id}`))),(await tx.query<{key:string}>(`SELECT fm.provider_entity_id || ':' || fl.provider_lineup_id || ':' || (detail->>'type_id') AS key FROM fixture_lineups fl JOIN fixtures f ON f.id=fl.fixture_id JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' CROSS JOIN LATERAL jsonb_array_elements(fl.unlinked_statistics) detail WHERE f.season_id=$1 AND COALESCE(detail->'value',detail->'data','{}'::jsonb)<>'{}'::jsonb`,[s.id])).rows.map(r=>r.key));
        const invalidFormations=Number((await tx.query(`SELECT count(*)::int AS count FROM fixture_formations d JOIN fixtures f ON f.id=d.fixture_id WHERE f.season_id=$1 AND d.team_id NOT IN (f.home_team_id,f.away_team_id)`,[s.id])).rows[0].count);
        if(invalidFormations)coverage.push({season:s.name,slug:s.slug,current:s.is_current,capability:'FORMATION_ASSOCIATION',provider:0,stored:invalidFormations,missing:invalidFormations,httpStatus:200,reason:'Stored formation references a different team'});
        const rejectedCoaches=confirmed.reduce((sum,f)=>sum+fixtureCoachSources(f).rejected.length,0);
        if(rejectedCoaches)sourceConflicts.push({slug:s.slug,season:s.name,capability:'COACHES',records:rejectedCoaches,reason:'Provider coach association does not reference either fixture participant; not reassigned by guesswork'});
        compare(s,'COACHES',confirmed.flatMap(f=>fixtureCoachSources(f).accepted.map(c=>`${f.id}:${c.coach_id??c.id}`)),(await tx.query<{key:string}>(`SELECT fm.provider_entity_id || ':' || d.provider_coach_id AS key FROM fixture_coaches d JOIN fixtures f ON f.id=d.fixture_id JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' WHERE f.season_id=$1`,[s.id])).rows.map(r=>r.key));
        const invalidCoaches=Number((await tx.query(`SELECT count(*)::int AS count FROM fixture_coaches d JOIN fixtures f ON f.id=d.fixture_id WHERE f.season_id=$1 AND d.team_id NOT IN (f.home_team_id,f.away_team_id)`,[s.id])).rows[0].count);
        if(invalidCoaches)coverage.push({season:s.name,slug:s.slug,current:s.is_current,capability:'COACH_ASSOCIATION',provider:0,stored:invalidCoaches,missing:invalidCoaches,httpStatus:200,reason:'Stored coach association references a different team'});
        const standings=await capturedAll(`football/standings/seasons/${s.provider_id}`,{include:'participant;details.type;stage;group;rule;form'});
        compare(s,'STANDINGS',standings.data.map(r=>r.id),(await tx.query<{provider_standing_id:string}>(`SELECT provider_standing_id FROM standings_current WHERE season_id=$1 UNION ALL SELECT provider_record_id FROM sports_unlinked_competition_records WHERE season_id=$1 AND capability='STANDINGS'`,[s.id])).rows.map(r=>r.provider_standing_id),standings.status);
        const scorers=await capturedAll(`football/topscorers/seasons/${s.provider_id}`,{include:'player;participant;type'});
        compare(s,'SCORERS',scorers.data.map(r=>r.id),(await tx.query<{provider_record_id:string}>(`SELECT provider_record_id FROM season_topscorers WHERE season_id=$1 UNION ALL SELECT provider_record_id FROM sports_unlinked_competition_records WHERE season_id=$1 AND capability='SCORERS'`,[s.id])).rows.map(r=>r.provider_record_id),scorers.status);
        const unlinked=(await tx.query<{capability:string;provider_record_id:string;payload:ProviderRow;reason:string}>(`SELECT capability,provider_record_id,payload,reason FROM sports_unlinked_competition_records WHERE season_id=$1`,[s.id])).rows;
        for(const row of unlinked){const source=(row.capability==='SCORERS'?scorers:standings).data.find(r=>String(r.id)===row.provider_record_id);assert.deepEqual(row.payload,source,'Unlinked official record changed');}
        for(const capability of ['STANDINGS','SCORERS']){const rows=unlinked.filter(r=>r.capability===capability);if(rows.length)sourceConflicts.push({slug:s.slug,season:s.name,capability:`${capability}_IDENTITY`,records:rows.length,reason:'Official totals preserved; provider omits associated team/player entity. No fabricated profile.'});}
        const teams=await capturedAll(`football/teams/seasons/${s.provider_id}`,{include:'country;venue;statistics.details.type',filters:`teamStatisticSeasons:${s.provider_id}`});
        compare(s,'TEAMS',teams.data.filter(t=>t.placeholder!==true).map(r=>r.id),(await tx.query<{provider_id:string}>(`SELECT m.provider_entity_id AS provider_id FROM team_seasons ts JOIN teams t ON t.id=ts.team_id JOIN provider_entity_mappings m ON m.livasports_entity_id=t.id AND m.provider='SPORTMONKS' AND m.entity_type='TEAM' WHERE ts.season_id=$1 AND NOT t.provider_placeholder`,[s.id])).rows.map(r=>r.provider_id),teams.status);
        compare(s,'TEAM_STATISTICS',teams.data.flatMap(t=>records(t.statistics).filter(r=>String(r.season_id)===s.provider_id).flatMap(r=>records(r.details).filter(d=>Object.keys(object(d.value??d.data)).length).map(d=>`${t.id}:${d.type_id}`))),(await tx.query<{key:string}>(`SELECT tm.provider_entity_id || ':' || d.provider_type_id AS key FROM team_season_statistics d JOIN provider_entity_mappings tm ON tm.livasports_entity_id=d.team_id AND tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' WHERE d.season_id=$1`,[s.id])).rows.map(r=>r.key));
        const squadKeys:string[]=[],statKeys:string[]=[],unavailable:number[]=[];
        for(const team of teams.data){
          const squad=await capturedAll(`football/squads/seasons/${s.provider_id}/teams/${team.id}`,{include:squadInclude});
          if(squad.status!==200){unavailable.push(Number(team.id));continue;}
          for(const player of squad.data){squadKeys.push(`${team.id}:${player.player_id}`);for(const d of records(player.details))if(Object.keys(object(d.value??d.data)).length)statKeys.push(`${team.id}:${player.player_id}:${d.type_id}`);}
        }
        const members=(await tx.query<{key:string}>(`SELECT tm.provider_entity_id || ':' || pm.provider_player_id AS key FROM team_squad_memberships sm JOIN provider_entity_mappings tm ON tm.livasports_entity_id=sm.team_id AND tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' JOIN player_provider_mappings pm ON pm.player_id=sm.player_id AND pm.provider='SPORTMONKS' WHERE sm.season_id=$1`,[s.id])).rows;
        compare(s,'PLAYERS',squadKeys,members.map(r=>r.key),200,unavailable.length?`Provider does not expose squads for ${unavailable.length} teams`:null);
        const playerStats=(await tx.query<{key:string}>(`SELECT tm.provider_entity_id || ':' || pm.provider_player_id || ':' || ps.provider_type_id AS key FROM player_season_statistics ps JOIN provider_entity_mappings tm ON tm.livasports_entity_id=ps.team_id AND tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' JOIN player_provider_mappings pm ON pm.player_id=ps.player_id AND pm.provider='SPORTMONKS' WHERE ps.season_id=$1`,[s.id])).rows;
        compare(s,'PLAYER_STATISTICS',statKeys,playerStats.map(r=>r.key));
      }catch(error){coverage.push({season:s.name,slug:s.slug,current:s.is_current,capability:'AUDIT',provider:1,stored:0,missing:1,httpStatus:null,reason:error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'?'Provider response not yet captured':'Season verification failed'});}
      console.log(JSON.stringify({phase:'season-audit',competition:s.slug,season:s.name,missing:coverage.filter(r=>r.slug===s.slug&&r.season===s.name).reduce((sum,r)=>sum+r.missing,0),providerRequests:0}));
    }
    const matrix=(await tx.query(`SELECT c.slug,c.canonical_name AS competition,
      (SELECT string_agg(s.name,', ' ORDER BY s.starts_at DESC) FROM seasons s WHERE s.competition_id=c.id AND s.is_current) AS current_season,
      (SELECT count(*)::int FROM seasons s WHERE s.competition_id=c.id) AS seasons,
      (SELECT count(*)::int FROM seasons s WHERE s.competition_id=c.id AND NOT s.is_current) AS historical_seasons,
      (SELECT count(*)::int FROM seasons s WHERE s.competition_id=c.id AND (SELECT count(*)=6 AND bool_and(status IN ('AVAILABLE','EMPTY','UNAVAILABLE')) FROM sports_season_coverage x WHERE x.season_id=s.id)) AS verified_seasons,
      (SELECT count(*)::int FROM fixtures f WHERE f.competition_id=c.id AND f.status IN ('SCHEDULED','LIVE','HALFTIME','POSTPONED') AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)) AS fixtures,
      (SELECT count(*)::int FROM sports_pending_fixtures p WHERE p.competition_id=c.id) AS pending,
      (SELECT count(*)::int FROM fixtures f WHERE f.competition_id=c.id AND f.status='FINISHED') AS results,
      (SELECT count(DISTINCT sc.season_id)::int FROM (SELECT season_id FROM standings_current WHERE competition_id=c.id UNION SELECT u.season_id FROM sports_unlinked_competition_records u JOIN seasons s ON s.id=u.season_id WHERE s.competition_id=c.id AND u.capability='STANDINGS') sc) AS standings_seasons,
      ((SELECT count(*) FROM season_topscorers st JOIN seasons s ON s.id=st.season_id WHERE s.competition_id=c.id AND st.provider_type_id=208 AND st.total>0)
        +(SELECT count(*) FROM player_season_statistics ps JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ps.provider_type_id
          WHERE ps.competition_id=c.id AND st.developer_name='GOALS'
          AND CASE WHEN ps.value->>'total' ~ '^[0-9]+([.][0-9]+)?$' THEN (ps.value->>'total')::numeric ELSE 0 END>0
          AND NOT EXISTS(SELECT 1 FROM season_topscorers t WHERE t.season_id=ps.season_id AND t.player_id=ps.player_id AND t.team_id=ps.team_id AND t.provider_type_id=208))
        +(SELECT count(*) FROM sports_unlinked_competition_records u JOIN seasons s ON s.id=u.season_id WHERE s.competition_id=c.id AND u.capability='SCORERS' AND (u.payload->>'type_id')::int=208 AND (u.payload->>'total')::numeric>0))::int AS scorers,
      (SELECT count(DISTINCT ts.team_id)::int FROM team_seasons ts JOIN seasons s ON s.id=ts.season_id JOIN teams t ON t.id=ts.team_id WHERE s.competition_id=c.id AND NOT t.provider_placeholder) AS teams,
      (SELECT count(DISTINCT sm.player_id)::int FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id WHERE s.competition_id=c.id) AS players,
      (SELECT count(DISTINCT fs.fixture_id)::int FROM fixture_statistics fs JOIN fixtures f ON f.id=fs.fixture_id WHERE f.competition_id=c.id) AS match_stats,
      (SELECT count(DISTINCT fl.fixture_id)::int FROM fixture_lineups fl JOIN fixtures f ON f.id=fl.fixture_id WHERE f.competition_id=c.id) AS lineups,
      (SELECT count(DISTINCT oc.fixture_id)::int FROM odds_current oc JOIN fixtures f ON f.id=oc.fixture_id WHERE f.competition_id=c.id) AS existing_odds,
      (SELECT count(*)::int FROM (SELECT least(f.home_team_id,f.away_team_id),greatest(f.home_team_id,f.away_team_id) FROM fixtures f WHERE f.competition_id=c.id AND f.status='FINISHED' GROUP BY 1,2 HAVING count(*)>1) meetings) AS h2h_pairs
      FROM competitions c WHERE c.enabled ORDER BY c.priority_br,c.slug`)).rows.map(row=>({...row,sourceAuditIncluded:auditedSeasons.some(s=>s.slug===row.slug),providerSupportedMissing:coverage.some(r=>r.slug===row.slug&&r.missing>0)}));
    const seasonProgress=(await tx.query(`SELECT c.slug,s.name,s.is_current,
      COALESCE(jsonb_object_agg(x.capability,jsonb_build_object('status',x.status,'httpStatus',x.http_status,'providerRecords',x.provider_count,'persistedRecords',x.persisted_count,'checkedAt',x.checked_at)) FILTER(WHERE x.capability IS NOT NULL),'{}'::jsonb) AS capabilities,
      count(x.capability)=6 AND bool_and(x.status IN ('AVAILABLE','EMPTY','UNAVAILABLE')) AS verified,
      COALESCE(bool_or(x.persisted_count>0),false) AS populated
      FROM seasons s JOIN competitions c ON c.id=s.competition_id LEFT JOIN sports_season_coverage x ON x.season_id=s.id WHERE c.enabled GROUP BY c.slug,s.id ORDER BY c.slug,s.starts_at DESC`)).rows;
    const importSummary={cataloguedSeasons:seasonProgress.length,verifiedSeasons:seasonProgress.filter(s=>s.verified).length,populatedSeasons:seasonProgress.filter(s=>s.populated).length,
      partialOrUnverifiedSeasons:seasonProgress.filter(s=>!s.verified).length,currentSeasons:seasonProgress.filter(s=>s.is_current).length,historicalSeasons:seasonProgress.filter(s=>!s.is_current).length,
      verifiedCurrentSeasons:seasonProgress.filter(s=>s.is_current&&s.verified).length,verifiedHistoricalSeasons:seasonProgress.filter(s=>!s.is_current&&s.verified).length};
    assert.equal(matrix.length,34);assert.equal((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
    return {status:matrix.some(r=>r.providerSupportedMissing)?'INCOMPLETE':'PASS',scope:currentOnly?'CURRENT_SEASONS':'ALL_SEASONS',auditedSeasons:auditedSeasons.map(s=>({slug:s.slug,season:s.name})),databaseReadOnly:true,providerRequests:0,snapshotAt,checkedAt:new Date().toISOString(),importSummary,seasonProgress,matrix,coverage,sourceConflicts};
  });
  await writeFile(currentOnly?'output/sports-current-coverage-matrix-private.json':'output/sports-coverage-matrix-private.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,scope:result.scope,competitions:result.matrix.filter(r=>r.sourceAuditIncluded).length,seasons:result.coverage.filter(r=>r.capability==='FIXTURES').length,providerRequests:0,databaseReadOnly:true,sourceConflicts:result.sourceConflicts,gaps:result.coverage.filter(r=>r.missing>0).map(r=>({competition:r.slug,season:r.season,capability:r.capability,missing:r.missing,reason:r.reason}))}));
  if(result.status!=='PASS')process.exitCode=1;
}catch{console.error('Sports coverage audit failed; private connection details were not logged.');process.exitCode=1;}
finally{await db.close();}
