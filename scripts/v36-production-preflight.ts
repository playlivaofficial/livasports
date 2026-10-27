/** Read-only production readiness: no claims, queue writes, model calls or publishing controls. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {collectPrimaryFeed} from '../src/editorial/primary-feed-discovery';
import {announcementErrors} from '../src/editorial/automation/announcements';
import {publicationSlug,stableFacts,fingerprint} from '../src/editorial/automation/policy';
const origin='https://livasports.com',project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
async function main(){
 const auth=JSON.parse(await readFile(process.env.APPDATA+'/com.vercel.cli/Data/auth.json','utf8'));
 const api=async(path:string)=>{const r=await fetch('https://api.vercel.com'+path,{headers:{Authorization:'Bearer '+auth.token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('VERCEL_READ_'+r.status);return r.json();};
 const catalog=await api(`/v10/projects/${project}/env?decrypt=false&teamId=${team}`);
 const item=(key:string)=>catalog.envs.find((e:{key:string;target:string[]})=>e.key===key&&e.target?.includes('production'));
 const value=async(key:string)=>{const e=item(key);assert.ok(e,'REQUIRED_CONFIGURATION_ABSENT');return (await api(`/v1/projects/${project}/env/${e.id}?teamId=${team}`)).value as string;};
 const report:Record<string,unknown>={at:new Date().toISOString(),newsroomWrites:0,modelCalls:0,configPresent:Object.fromEntries(['CRON_SECRET','OPENAI_API_KEY','DATABASE_URL','V3_NEWS_AUTOMATION_ENABLED','V3_NEWS_MODEL_ENABLED','V3_NEWS_BUDGET_MODE'].map(k=>[k,!!item(k)]))};
 const health=await fetch(origin+'/api/internal/health');assert.equal(health.status,200);const h=await health.json();report.release={sha:h.release.commit,providerRequests:h.providerRequests};
 const secret=await value('CRON_SECRET');assert.ok(secret?.trim());
 const unauthorized=await fetch(origin+'/api/internal/editorial/news-cycle');assert.equal(unauthorized.status,401);
 // Disabled endpoint returns before initializing storage or calling sources.
 const keyFile=await readFile('../../output/hardening-owner-permanent-key.txt','utf8'),ownerKey=keyFile.match(/^PERMANENT_OWNER_KEY=(.+)$/m)?.[1].trim();assert.ok(ownerKey);
 const headers:Record<string,string>={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
 const login=await fetch(origin+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'login',key:ownerKey})});assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie')!.split(';')[0];
 try{const r=await fetch(origin+'/api/owner/news/automation',{headers});assert.equal(r.status,200);const d=await r.json();assert.equal(d.paused,true);assert.equal(d.enabled,false);assert.equal(d.modelEnabled,false);
 report.control={paused:d.paused,enabled:d.enabled,modelEnabled:d.modelEnabled,modelConfigured:d.modelConfigured,budgetMode:d.budgetMode,limits:d.limits,usage:d.usage};
 report.sources=d.sources;report.runs=d.runs.map((x:{id:string;started_at:string;status:string})=>({id:x.id,startedAt:x.started_at,status:x.status}));
 }finally{await fetch(origin+'/api/owner/preview',{method:'POST',headers,body:JSON.stringify({action:'logout'})});}
 const cron=await fetch(origin+'/api/internal/editorial/news-cycle',{headers:{Authorization:`Bearer ${secret}`}});assert.equal(cron.status,200);const c=await cron.json();assert.equal(c.status,'disabled');report.schedulerAuthentication={authorized:cron.status,unauthorized:unauthorized.status,result:c,cache:cron.headers.get('cache-control')};
 const deployment=await api(`/v13/deployments/${h.release.commit=== 'd3b4888561218f4376401dce4b6300421f335cca'?'dpl_7adNtj6ysFx8vfbFh74XuwLdRNMv':'invalid'}?teamId=${team}`);
 const p=await api(`/v9/projects/${project}?teamId=${team}`);report.deployment={id:deployment.id,state:deployment.readyState,cron:deployment.crons??p.crons??null};
 const uri=new URL(await value('DATABASE_URL'));assert.ok(uri.hostname.endsWith('.neon.tech'));uri.searchParams.set('sslmode','verify-full');
 const pool=new Pool({connectionString:uri.href,max:1,connectionTimeoutMillis:10000,statement_timeout:10000});const db=await pool.connect();
 try{
 await db.query('BEGIN READ ONLY');
 report.database=(await db.query("SELECT current_database() AS database,pg_database_size(current_database()) AS bytes,(SELECT count(*) FROM editorial_automation_runs WHERE status='running' AND lease_until>now()) AS active_leases,(SELECT count(*) FROM editorial_news WHERE archived) AS protected_archives,(SELECT count(*) FROM editorial_news WHERE published IS NOT NULL AND NOT archived) AS publications,(SELECT count(*) FROM editorial_automation_events) AS automation_events")).rows[0];
 let requests=0;const found=await collectPrimaryFeed('nfl-cardinals',async(input,init)=>{assert.ok(++requests<=3);return fetch(input,init);},new Date());
 report.discovery={status:found.status,requests};const candidates=[];
 for(const f of ('announcements' in found?found.announcements:[])??[]){
  const blockers=(await db.query("SELECT count(*) AS records,count(*) FILTER (WHERE archived) AS archives FROM editorial_news WHERE slug=$1 OR draft->>'sourceUrl'=$2 OR published->>'sourceUrl'=$2",[publicationSlug(f),f.sourceUrl])).rows[0];
  const events=(await db.query('SELECT event_key,state,reason,attempts,news_slug FROM editorial_automation_events WHERE source_url=$1 OR event_key=$2',[f.sourceUrl,f.eventKey])).rows;
  candidates.push({facts:f,slug:publicationSlug(f),fingerprint:fingerprint(stableFacts(f)),errors:announcementErrors(f),ownerRecords:Number(blockers.records),protectedArchives:Number(blockers.archives),events,eligible:!announcementErrors(f).length&&Number(blockers.records)===0&&events.length===0});
 }report.candidates=candidates;
 await db.query('ROLLBACK');
 }finally{db.release();await pool.end();}
 await mkdir('output/v3-qa/v36',{recursive:true});await writeFile('output/v3-qa/v36/production-preflight.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(/^[A-Z_]+(?:_\d+)?$/.test(e.message)?e.message:'READ_ONLY_PREFLIGHT_FAILED');process.exitCode=1;});
