import {writeFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {SportsAuditProvider} from '../src/sports/provider-audit';
import type {ProviderRow} from '../src/sports/ingestion-store';
const db=new PostgresDatabaseClient(databaseUrl()!);
const run=(await db.query<{id:string}>(`INSERT INTO ingestion_sync_runs(sync_kind,target_key,status) VALUES('FIXTURES','SPORTS_H2H_AUDIT','RUNNING') RETURNING id`)).rows[0].id;
const provider=new SportsAuditProvider(process.env.SPORTMONKS_API_KEY!,db,run);
try{
  const targets=(await db.query<{slug:string;home:string;away:string}>(`SELECT c.slug,hm.provider_entity_id AS home,am.provider_entity_id AS away FROM competitions c JOIN LATERAL(SELECT home_team_id,away_team_id FROM fixtures WHERE competition_id=c.id ORDER BY CASE WHEN status='SCHEDULED' AND kickoff>now() THEN 0 ELSE 1 END,abs(extract(epoch FROM kickoff-now())) LIMIT 1) f ON true JOIN provider_entity_mappings hm ON hm.livasports_entity_id=f.home_team_id AND hm.provider='SPORTMONKS' AND hm.entity_type='TEAM' JOIN provider_entity_mappings am ON am.livasports_entity_id=f.away_team_id AND am.provider='SPORTMONKS' AND am.entity_type='TEAM' WHERE c.enabled ORDER BY c.priority_br`)).rows;
  const report=[];
  for(const target of targets){
    const r=await provider.all<ProviderRow>(`football/fixtures/head-to-head/${target.home}/${target.away}`,{include:'participants;state;scores;season;league'});
    const mapped=r.data.length?(await db.query<{provider_entity_id:string}>(`SELECT provider_entity_id FROM provider_entity_mappings m JOIN fixtures f ON f.id=m.livasports_entity_id WHERE m.provider='SPORTMONKS' AND m.entity_type='FIXTURE' AND provider_entity_id=ANY($1::text[])`,[r.data.map(f=>String(f.id))])).rows:[];
    const known=new Set(mapped.map(r=>r.provider_entity_id));
    report.push({slug:target.slug,status:r.status,providerFixtures:r.data.length,persisted:mapped.length,missing:r.data.filter(f=>!known.has(String(f.id))).map(f=>({id:f.id,league:f.league_id,season:f.season_id,kickoff:f.starting_at}))});
    await writeFile('output/sports-h2h-audit-private.json',JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({providerRequests:provider.requests,competitions:report.length,missing:report.map(r=>({slug:r.slug,provider:r.providerFixtures,missing:r.missing.length}))}));
  await db.query(`UPDATE ingestion_sync_runs SET status='SUCCEEDED',completed_at=now() WHERE id=$1`,[run]);
}catch{await db.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),error_message='Sports H2H audit incomplete' WHERE id=$1`,[run]);process.exitCode=1;console.error('Sports H2H audit incomplete; credentials were not logged.');}
finally{await db.close();}
