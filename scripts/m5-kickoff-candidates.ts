import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {canonicalFixtures} from '../src/odds/ingestion';
import {matchOddsFixture} from '../src/odds/matching';
import type {ProviderOddsFixture} from '../src/odds/types';
const db=new PostgresDatabaseClient(databaseUrl()!);
const file='output/m5-kickoff-supplement-private.json';
try{
  if(existsSync(file)){const saved=JSON.parse(await readFile(file,'utf8'));console.info(JSON.stringify({status:saved.status,requests:saved.requests,evidence:saved.evidence?.length}));}
  else{
    const raw=(await db.query("SELECT evidence FROM odds_mapping_reviews WHERE state='TIME_MISMATCH'")).rows.map(r=>r.evidence as ProviderOddsFixture);
    const fixtures=await canonicalFixtures(db);const matches=raw.map(r=>({raw:r,candidates:fixtures.filter(f=>matchOddsFixture({...r,kickoff:f.kickoff},[f],[]).fixture!==null)}));
    const unique=matches.filter(m=>m.candidates.length===1);const ids=unique.map(m=>m.candidates[0].id);
    const rows=(await db.query(`SELECT f.id,f.kickoff,m.provider_entity_id,hm.provider_entity_id AS home_provider_id,am.provider_entity_id AS away_provider_id,
      c.slug,f.status FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      JOIN provider_entity_mappings m ON m.livasports_entity_id=f.id AND m.provider='SPORTMONKS' AND m.entity_type='FIXTURE'
      JOIN provider_entity_mappings hm ON hm.livasports_entity_id=f.home_team_id AND hm.provider='SPORTMONKS' AND hm.entity_type='TEAM'
      JOIN provider_entity_mappings am ON am.livasports_entity_id=f.away_team_id AND am.provider='SPORTMONKS' AND am.entity_type='TEAM'
      WHERE f.id=ANY($1::uuid[]) ORDER BY f.kickoff`,[ids])).rows;
    const summary={suspected:raw.length,uniqueCandidates:rows.length,ambiguous:matches.filter(m=>m.candidates.length!==1).length,
      byCompetition:Object.fromEntries([...new Set(rows.map(r=>r.slug))].map(slug=>[slug,rows.filter(r=>r.slug===slug).length])),
      timeDifferenceMinutes:[...new Set(unique.map(m=>(Date.parse(m.raw.kickoff)-Date.parse(m.candidates[0].kickoff))/60000))]};
    console.info(JSON.stringify(summary));
    if(process.argv.includes('--verify-source')){
      if(rows.length<1||rows.length>50||new Set(ids).size!==ids.length)throw new Error('Candidate diagnostic bound violated');
      const endpoint=`/v3/football/fixtures/multi/${rows.map(r=>r.provider_entity_id).join(',')}`;
      await writeFile(file,JSON.stringify({status:'STARTED',requests:1,endpoint,summary}));
      const response=await fetch(`https://api.sportmonks.com${endpoint}?include=participants;state&timezone=UTC`,{headers:{Authorization:process.env.SPORTMONKS_API_KEY!,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`Sportmonks ${response.status}`);
      const body=await response.json();const evidence=body.data.map((r:Record<string,unknown>)=>({providerId:r.id,name:r.name,starting_at:r.starting_at,starting_at_timestamp:r.starting_at_timestamp,
        league_id:r.league_id,participants:r.participants,state:r.state,canonical:rows.find(f=>f.provider_entity_id===String(r.id))}));
      const result={at:new Date().toISOString(),status:200,requests:1,endpoint,summary,evidence};
      await writeFile(file,JSON.stringify(result,null,2));console.info(JSON.stringify({status:200,evidence:evidence.length,requests:1}));
    }
  }
}catch{console.error('Supplemental kickoff diagnostic stopped safely');process.exitCode=1;}
finally{await db.close();}
