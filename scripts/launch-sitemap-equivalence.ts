import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {SportsSitemapRepository,sitemapPlayerEligibilitySql} from '../src/sports/sitemap-repository';
const db=new PostgresDatabaseClient(databaseUrl()!,undefined,{statementTimeoutMs:60_000});
try{
  const old=`SELECT p.id FROM players p WHERE p.id IN (SELECT sm.player_id FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id WHERE c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')) AND p.id IN (SELECT player_id FROM player_season_statistics UNION SELECT player_entity_id FROM fixture_lineups WHERE player_entity_id IS NOT NULL UNION SELECT player_id FROM fixture_player_statistics)`;
  const equivalent=(await db.query(`WITH old_set AS MATERIALIZED (${old}),new_set AS MATERIALIZED (SELECT id FROM (${sitemapPlayerEligibilitySql}) n)
    SELECT (SELECT count(*) FROM old_set)::int AS old_count,(SELECT count(*) FROM new_set)::int AS new_count,
      (SELECT count(*) FROM ((SELECT id FROM old_set EXCEPT SELECT id FROM new_set) UNION ALL (SELECT id FROM new_set EXCEPT SELECT id FROM old_set)) delta)::int AS changed_ids`)).rows[0];
  const repository=new SportsSitemapRepository(db),start=Date.now();const entries=await repository.entries('players',500,48500);const batchMs=Date.now()-start;
  const cStart=Date.now();const counts=await repository.counts();
  const result={at:new Date().toISOString(),equivalent,batch97:{rows:entries.length,ms:batchMs},counts,countsMs:Date.now()-cStart,providerRequests:0};
  await writeFile('output/hardening-sitemap-equivalence.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  if(equivalent.changed_ids!==0)process.exitCode=1;
}catch(error){console.error(JSON.stringify({code:error&&typeof error==='object'&&'code' in error?error.code:'SITEMAP_VERIFY_FAILED'}));process.exitCode=1;}finally{await db.close();}
