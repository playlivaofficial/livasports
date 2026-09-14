import {writeFile,readFile} from 'node:fs/promises';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {SportsAuditProvider} from '../src/sports/provider-audit';
import {object,type ProviderRow} from '../src/sports/ingestion-store';
import {standingRule} from '../src/sports/standing-policy';
const db=new PostgresDatabaseClient(databaseUrl()!);
const run=(await db.query<{id:string}>(`INSERT INTO ingestion_sync_runs(sync_kind,target_key,status) VALUES('FIXTURES','SPORTS_RULES_AUDIT','RUNNING') RETURNING id`)).rows[0].id;
const api=new SportsAuditProvider(process.env.SPORTMONKS_API_KEY!,db,run);
try{
  const seasons=(await db.query<{provider_id:string;is_current:boolean;rule_ids:number[]|null}>(`SELECT m.provider_entity_id AS provider_id,s.is_current,
    array_agg(DISTINCT (sc.provider_rule->>'type_id')::int) FILTER(WHERE sc.provider_rule->>'type_id' ~ '^[0-9]+$') AS rule_ids
    FROM seasons s JOIN competitions c ON c.id=s.competition_id JOIN provider_entity_mappings m ON m.livasports_entity_id=s.id AND m.provider='SPORTMONKS' AND m.entity_type='SEASON'
    LEFT JOIN (SELECT season_id,provider_rule FROM standings_current
      UNION ALL SELECT season_id,payload->'rule' AS provider_rule FROM sports_unlinked_competition_records WHERE capability='STANDINGS') sc
      ON sc.season_id=s.id WHERE c.enabled GROUP BY m.provider_entity_id,s.id`)).rows
    .filter(s=>(!process.argv.includes('--unknown-only')&&s.is_current)||s.rule_ids?.some(id=>!standingRule('en',id)));
  const rules=new Map<number,ProviderRow>();
  for(const season of seasons){
    const r=await api.all<ProviderRow>(`football/standings/seasons/${season.provider_id}`,{include:'rule.type'});
    if(r.status!==200)throw Error('Rules audit unavailable');
    for(const row of r.data){const rule=object(object(row.rule).type);if(rule.id)rules.set(Number(rule.id),{id:rule.id,name:rule.name,developerName:rule.developer_name});}
  }
  const meetings=JSON.parse(await readFile('output/sports-h2h-audit-private.json','utf8')) as Array<{missing:Array<{season:number;league:number}>}>;
  const missingSeasons=[...new Set(meetings.flatMap(r=>r.missing.map(f=>String(f.season))))];
  const known=(await db.query<{provider_entity_id:string}>(`SELECT provider_entity_id FROM provider_entity_mappings m JOIN seasons s ON s.id=m.livasports_entity_id WHERE provider='SPORTMONKS' AND entity_type='SEASON' AND provider_entity_id=ANY($1::text[])`,[missingSeasons])).rows.map(r=>r.provider_entity_id);
  const report={rules:[...rules.values()].sort((a,b)=>Number(a.id)-Number(b.id)),h2hOutsideSeasonCatalogue:missingSeasons.filter(id=>!known.includes(id)),providerRequests:api.requests};
  await writeFile('output/sports-rules-audit-private.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await db.query(`UPDATE ingestion_sync_runs SET status='SUCCEEDED',completed_at=now() WHERE id=$1`,[run]);
}catch{await db.query(`UPDATE ingestion_sync_runs SET status='FAILED',completed_at=now(),error_message='Sports rules audit incomplete' WHERE id=$1`,[run]);console.error('Sports rules audit incomplete; private values were not logged.');process.exitCode=1;}
finally{await db.close();}
