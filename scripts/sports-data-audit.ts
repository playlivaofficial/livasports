import {writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';

const url=databaseUrl();
if(!url)throw new Error('Sports database is not configured');
const db=new PostgresDatabaseClient(url);
try{
  const report=await db.transaction(async tx=>{
    await tx.query('SET TRANSACTION READ ONLY');
    const competitions=(await tx.query(`SELECT c.slug,c.coverage_status,
      (SELECT count(*)::int FROM seasons s WHERE s.competition_id=c.id) AS seasons,
      (SELECT count(*)::int FROM fixtures f WHERE f.competition_id=c.id AND f.status='SCHEDULED' AND f.kickoff>now()) AS upcoming,
      (SELECT count(*)::int FROM fixtures f WHERE f.competition_id=c.id AND f.status='FINISHED') AS results,
      (SELECT count(*)::int FROM standings_current sc WHERE sc.competition_id=c.id) AS standings,
      (SELECT count(DISTINCT ps.player_id)::int FROM player_season_statistics ps JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ps.provider_type_id WHERE ps.competition_id=c.id AND st.developer_name='GOALS') AS scorers,
      (SELECT count(DISTINCT ts.team_id)::int FROM team_seasons ts JOIN seasons s ON s.id=ts.season_id WHERE s.competition_id=c.id) AS teams,
      (SELECT count(DISTINCT fl.fixture_id)::int FROM fixture_lineups fl JOIN fixtures f ON f.id=fl.fixture_id WHERE f.competition_id=c.id) AS lineups,
      (SELECT count(DISTINCT fs.fixture_id)::int FROM fixture_statistics fs JOIN fixtures f ON f.id=fs.fixture_id WHERE f.competition_id=c.id) AS statistics
      FROM competitions c WHERE c.enabled ORDER BY c.priority_br,c.slug`)).rows;
    const seasons=(await tx.query(`SELECT c.slug,s.name,s.id,s.is_current,count(f.id)::int AS fixtures,
      min(f.kickoff) AS first_match,max(f.kickoff) AS last_match FROM seasons s JOIN competitions c ON c.id=s.competition_id LEFT JOIN fixtures f ON f.season_id=s.id WHERE c.enabled GROUP BY c.slug,s.id ORDER BY c.slug,s.starts_at DESC NULLS LAST`)).rows;
    const observedMatch=(await tx.query(`SELECT public_id,status,home_score,away_score,kickoff,updated_at FROM fixtures WHERE public_id='a7ca59c522504409'`)).rows;
    const goalShapes=(await tx.query(`SELECT DISTINCT ps.value FROM player_season_statistics ps JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ps.provider_type_id WHERE st.developer_name='GOALS' LIMIT 4`)).rows;
    return {checkedAt:new Date().toISOString(),databaseReadOnly:true,providerRequests:0,competitions,seasons,observedMatch,goalShapes};
  });
  await writeFile('output/sports-data-audit-private.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({databaseReadOnly:report.databaseReadOnly,providerRequests:0,competitions:report.competitions,observedMatch:report.observedMatch,goalShapes:report.goalShapes},null,2));
}catch{console.error('Sports data audit failed; no private database details logged.');process.exitCode=1;}
finally{await db.close();}
