import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { databaseUrl, PostgresDatabaseClient } from '../src/database/client';
const file='output/m5-kickoff-private.json';
const db=new PostgresDatabaseClient(databaseUrl()!);
try {
  if (existsSync(file)) { console.info(await readFile(file,'utf8')); }
  else {
    const rows=(await db.query(`SELECT f.id,f.kickoff,f.competition_id,f.home_team_id,f.away_team_id,m.provider_entity_id,
      hm.provider_entity_id AS home_provider_id,am.provider_entity_id AS away_provider_id,c.slug,
      row_number() OVER(PARTITION BY c.slug ORDER BY f.kickoff) AS rank
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      JOIN provider_entity_mappings m ON m.livasports_entity_id=f.id AND m.provider='SPORTMONKS' AND m.entity_type='FIXTURE'
      JOIN provider_entity_mappings hm ON hm.livasports_entity_id=f.home_team_id AND hm.provider='SPORTMONKS' AND hm.entity_type='TEAM'
      JOIN provider_entity_mappings am ON am.livasports_entity_id=f.away_team_id AND am.provider='SPORTMONKS' AND am.entity_type='TEAM'
      WHERE c.slug IN ('brasileirao-serie-a','liga-mx','premier-league','copa-libertadores') AND f.kickoff>now()
      ORDER BY rank,c.slug LIMIT 8`)).rows;
    const endpoint=`/v3/football/fixtures/multi/${rows.map(r=>r.provider_entity_id).join(',')}`;
    await writeFile(file,JSON.stringify({state:'STARTED',requests:1,endpoint}));
    const response=await fetch(`https://api.sportmonks.com${endpoint}?include=participants;state&timezone=UTC`,
      {headers:{Authorization:process.env.SPORTMONKS_API_KEY!,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error(`Sportmonks ${response.status}`);
    const body=await response.json();
    const evidence=body.data.map((r: Record<string,unknown>)=>({providerId:r.id,name:r.name,starting_at:r.starting_at,
      starting_at_timestamp:r.starting_at_timestamp,league_id:r.league_id,participants:r.participants,state:r.state,
      canonical:rows.find(f=>f.provider_entity_id===String(r.id))}));
    const result={at:new Date().toISOString(),requests:1,status:response.status,endpoint,evidence};
    await writeFile(file,JSON.stringify(result,null,2));console.info(JSON.stringify(result));
  }
} catch { console.error('Kickoff audit did not complete; inspect sanitized local ledger');process.exitCode=1; }
finally {await db.close();}
