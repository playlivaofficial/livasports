import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {SLIP_SCOPE,type CanonicalSelection} from '../src/slip/types';
const base=process.argv[2]??'http://localhost:3300';if(!['http://localhost:3300','https://livasports.com'].includes(base))throw new Error('QA_ORIGIN_NOT_ALLOWED');
const db=new PostgresDatabaseClient(databaseUrl()!);const checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
const check=(name:string,pass:boolean,detail?:unknown)=>{checks.push({name,pass,detail});if(!pass)process.exitCode=1;};
async function usage(){return (await db.query(`SELECT (SELECT count(*) FROM odds_provider_requests) AS odds,
  (SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+
  (SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports`)).rows[0];}
async function post(body:unknown){const r=await fetch(base+'/api/slip/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}
try{
  const before=await usage();
  const rows=(await db.query(`SELECT f.public_id,max(o.observed_at) AS observed_at FROM fixtures f JOIN odds_current o ON o.fixture_id=f.id JOIN bookmakers b ON b.id=o.bookmaker_id
    WHERE f.status='SCHEDULED' AND f.kickoff>now() AND b.provider_slug='betano.bet.br' GROUP BY f.public_id ORDER BY observed_at DESC,f.public_id LIMIT 10`)).rows;
  const selections:CanonicalSelection[]=rows.map(r=>({fixturePublicId:r.public_id,market:'MATCH_WINNER',outcome:'HOME',line:null,scope:SLIP_SCOPE}));
  const br=await post({locale:'br',selections});check('bounded ten-selection BR resolution',br.status===200&&br.body.selections.length===10&&br.body.providerRequests===0,{states:br.body.selections?.map((s:{state:string})=>s.state)});
  check('private hard-expiring read boundary',br.cache==='private, no-store');
  check('no provider/DB IDs or destinations in slip response',!/providerFixtureId|bookmakerId|destination_url|sourceDomain|"fixtureId"|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(JSON.stringify(br.body)));
  const mx=await post({locale:'mx',selections});check('canonical intent survives MX without BR prices',mx.status===200&&mx.body.selections.every((s:{price:unknown})=>s.price===null)&&mx.body.selections[0].selection.fixturePublicId===selections[0].fixturePublicId);
  const repeated=await post({locale:'br',selections});check('repeat read succeeds without provider',repeated.status===200&&repeated.body.providerRequests===0);
  const missing=await post({locale:'br',selections:[{...selections[0],fixturePublicId:'0000000000000000'}]});check('missing fixture remains explicit saved intent',missing.status===200&&missing.body.selections[0].reason==='MISSING_FIXTURE'&&missing.body.selections[0].price===null);
  const finished=(await db.query("SELECT public_id FROM fixtures WHERE status='FINISHED' ORDER BY kickoff DESC LIMIT 1")).rows[0];
  const ended=await post({locale:'br',selections:[{...selections[0],fixturePublicId:finished.public_id}]});check('real finished match has no pregame price',ended.body.selections[0].state==='MATCH_FINISHED'&&ended.body.selections[0].price===null);
  for(const body of [{locale:'br',selections:[...selections,selections[0]]},{locale:'br',selections:[{...selections[0],market:'DOUBLE_CHANCE'}]},
    {locale:'br',selections:[{...selections[0],scope:'FIRST_HALF'}]},{locale:'br',selections:[{...selections[0],market:'TOTAL_GOALS',outcome:'OVER',line:3.5}]},
    {locale:'br',selections,provider:'ODDSPAPI'}])check('invalid input rejected', (await post(body)).status===400);
  const after=await usage();check('normal slip provider delta zero',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const result={at:new Date().toISOString(),base,pass:checks.every(c=>c.pass),checks};await writeFile(`output/m6-${base.startsWith('https')?'production':'local'}-http-private.json`,JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch{console.error('M6_HTTP_QA_FAILED; no credentials logged');process.exitCode=1;}finally{await db.close();}
