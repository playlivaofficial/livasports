import {writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {SLIP_SCOPE} from '../src/slip/types';
const base=process.argv[2]??'http://localhost:3300';if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_ORIGIN_NOT_ALLOWED');
const db=new PostgresDatabaseClient(databaseUrl()!),checks:Array<{name:string;pass:boolean;detail?:unknown}>=[];
function check(name:string,pass:boolean,detail?:unknown){checks.push({name,pass,detail});if(!pass)process.exitCode=1;}
async function usage(){return (await db.query(`SELECT (SELECT count(*) FROM odds_provider_requests) AS odds,(SELECT coalesce(sum(provider_requests),0) FROM ingestion_sync_runs)+(SELECT coalesce(sum(provider_requests),0) FROM match_center_sync_jobs)+(SELECT coalesce(sum(provider_requests),0) FROM profile_sync_jobs) AS sports`)).rows[0];}
async function post(body:unknown){const start=performance.now();const r=await fetch(base+'/api/slip/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control'),ms:Math.round(performance.now()-start)};}
try{
  const before=await usage();const ids=(await db.query(`SELECT public_id FROM fixtures f WHERE status='SCHEDULED' AND kickoff>now() AND EXISTS(SELECT 1 FROM odds_current o WHERE o.fixture_id=f.id) ORDER BY kickoff LIMIT 10`)).rows;
  const selections=ids.map(r=>({fixturePublicId:r.public_id,scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null}));
  const empty=await post({locale:'br',selections:[]});check('empty comparison explicit',empty.status===200&&empty.body.comparison.states.includes('EMPTY_SLIP'));
  const br=await post({locale:'br',selections});check('ten real canonical selections resolved',br.status===200&&br.body.selections.length===10&&br.body.providerRequests===0);
  check('private no-store HTTP boundary',br.cache==='private, no-store');
  check('no secret destination or provider identifiers',!/destination_url|partner=|providerFixtureId|sourceDomain|postgres(?:ql)?:|api[_-]?key/i.test(JSON.stringify(br.body)));
  check('totals only for complete current exact coverage',br.body.comparison.bookmakers.every((b:{complete:boolean;combinedDecimalOdds:string|null;selectionQuotes:Array<{decimalOdds:string|null}>})=>b.complete?b.selectionQuotes.every(q=>q.decimalOdds!==null):b.combinedDecimalOdds===null));
  const repeat=await post({locale:'br',selections:[...selections].reverse()});check('repeat reversed order retains identity and uses same result',repeat.status===200&&repeat.body.selections[0].selection.fixturePublicId===selections.at(-1)!.fixturePublicId,{firstMs:br.ms,repeatMs:repeat.ms});
  const mx=await post({locale:'mx',selections});check('MX retains global comparison while independently denying affiliate actions',mx.status===200&&mx.body.selections.length===10&&
    mx.body.comparison.bookmakers.length>0&&mx.body.comparison.bookmakers.every((b:{affiliateEligibility:{approved:boolean;destinationConfigured:boolean};outboundCapability:string})=>
      !b.affiliateEligibility.approved&&!b.affiliateEligibility.destinationConfigured&&b.outboundCapability==='NONE'));
  for(const body of [{locale:'br',selections:[...selections,selections[0]]},{locale:'br',selections:[{...selections[0],scope:'FIRST_HALF'}]},{locale:'br',selections:[{...selections[0],market:'DRAW_NO_BET'}]},{locale:'br',selections:[{...selections[0],market:'TOTAL_GOALS',outcome:'OVER',line:3.5}]},{locale:'br',selections,providerFixtureId:'123'}])check('malformed canonical payload rejected',(await post(body)).status===400);
  const missing=await post({locale:'br',selections:[{...selections[0],fixturePublicId:'0000000000000000'}]});check('missing fixture preserved explicitly',missing.body.selections[0].reason==='MISSING_FIXTURE'&&missing.body.comparison.bookmakers.every((b:{complete:boolean})=>!b.complete));
  const query=new URLSearchParams({locale:'br',selections:JSON.stringify(selections)});const out=await fetch(`${base}/go/slip/betsson?${query}`,{redirect:'manual'});
  check('unconfigured or stale outbound stays on LivaSports',out.status===303&&out.headers.get('location')===base+'/br?slip=unavailable');
  const attack=await fetch(`${base}/go/slip/betsson?${query}&url=https://evil.invalid`,{redirect:'manual'});check('arbitrary outbound redirect denied',attack.status===400);
  const badOrigin=await fetch(base+'/api/slip/compare',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.invalid'},body:JSON.stringify({locale:'br',selections})});check('cross-origin denied',badOrigin.status===403);
  const after=await usage();check('normal comparison/read/CTA provider delta zero',JSON.stringify(before)===JSON.stringify(after),{before,after});
  const result={at:new Date().toISOString(),base,status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,bookmakers:br.body.comparison.bookmakers.map((b:{bookmakerId:string;availableSelectionCount:number;ctaState:string})=>({bookmaker:b.bookmakerId,available:b.availableSelectionCount,cta:b.ctaState}))};
  await writeFile('output/m7-http-qa-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch{console.error('M7_HTTP_QA_FAILED; no private configuration logged');process.exitCode=1;}finally{await db.close();}
