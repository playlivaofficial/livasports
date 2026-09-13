import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
const phase=process.argv[2];if(phase!=='before'&&phase!=='after')throw Error('QA_PHASE_REQUIRED');
const url=databaseUrl();if(!url)throw Error('DATABASE_CONFIG_REQUIRED');
const db=new PostgresDatabaseClient(url);
try{
  const result=await db.transaction(async tx=>{
    await tx.query('SET TRANSACTION READ ONLY');
    if((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only!=='on')throw Error('READ_ONLY_REQUIRED');
    const counts=(await tx.query(`SELECT (SELECT count(*) FROM competitions WHERE enabled) AS competitions,
      (SELECT count(*) FROM odds_provider_requests) AS odds_http,
      (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports_requests`)).rows[0];
    const commercial:Record<string,string>={};
    for(const table of ['schema_migrations','affiliate_campaigns','affiliate_links','profile_sponsor_campaigns','bookmaker_geo_availability']){
      // Only fixed table identifiers are used. Never serialize private rows or fields.
      const rows=(await tx.query(`SELECT md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${table} t`)).rows;
      commercial[table]=rows[0].digest;
    }
    return {counts,commercial};
  });
  const files:Record<string,string>={};
  for(const path of ['.env.local','.env.production.local','.env.g1-affiliate-config.json','.env.g1-portal-private.json'])if(existsSync(path))files[path]=createHash('sha256').update(readFileSync(path)).digest('hex');
  const report={...result,files};
  if(phase==='before')writeFileSync('output/g1-language-baseline-private.json',JSON.stringify(report));
  else {
    const before=JSON.parse(readFileSync('output/g1-language-baseline-private.json','utf8'));
    if(JSON.stringify(before)!==JSON.stringify(report))throw Error('PRESERVATION_OR_PROVIDER_COUNTER_CHANGED');
  }
  if(Number(result.counts.competitions)!==34)throw Error('COMPETITION_COVERAGE_CHANGED');
  console.log(JSON.stringify({status:'PASS',phase,competitions:34,readOnly:true,providerRequests:0,privateValuesPrinted:false}));
}finally{await db.close();}
