/** Read-only stored result + one matching public ODbL fact check. No model or DB writes. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {resultsFromSnapshot,publicationSlug,fingerprint,stableFacts} from '../src/editorial/automation/policy';
const token=JSON.parse(await readFile(process.env.APPDATA+'/com.vercel.cli/Data/auth.json','utf8')).token;
const api=async(path:string)=>{const r=await fetch('https://api.vercel.com'+path,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200,'CONFIG_READ_FAILED');return r.json();};
const base='/projects/prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno';
const catalog=await api('/v10'+base+'/env?decrypt=false&teamId='+team),entry=catalog.envs.find((e:{key:string;target:string[]})=>e.key==='DATABASE_URL'&&e.target?.includes('production'));
const uri=new URL((await api('/v1'+base+'/env/'+entry.id+'?teamId='+team)).value);assert.ok(uri.hostname.endsWith('.neon.tech'));uri.searchParams.set('sslmode','verify-full');
const db=new Pool({connectionString:uri.href,max:1,statement_timeout:10000});
try{
 await db.query('BEGIN READ ONLY');
 const snapshot=(await db.query("SELECT published FROM sports_snapshots WHERE competition_id='bundesliga' AND NOT archived AND published IS NOT NULL ORDER BY edited_at DESC LIMIT 1")).rows[0]?.published;
 const report:Record<string,unknown>={at:new Date().toISOString(),modelCalls:0,productionWrites:0,snapshot: snapshot?{observedAt:snapshot.observedAt,sourceId:snapshot.sourceId,mode:snapshot.mode}:null,candidate:null};
 if(snapshot){for(const facts of resultsFromSnapshot(snapshot)){
 const duplicates=(await db.query("SELECT (SELECT count(*) FROM editorial_news WHERE slug=$1 OR draft->>'sourceUrl'=$2 OR published->>'sourceUrl'=$2) AS records,(SELECT count(*) FROM editorial_automation_events WHERE event_key=$3 OR source_url=$2) AS events",[publicationSlug(facts),facts.sourceUrl,facts.eventKey])).rows[0];
 if(Number(duplicates.records)||Number(duplicates.events))continue;
 const response=await fetch(facts.sourceUrl,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LivaSports-EditorialDiscovery/1.0 (+https://livasports.com)'}});
 report.sourceRequestStatus=response.status;report.sourceRequests=1;
 if(response.ok){const match=await response.json(),final=match.matchResults?.find((r:{resultTypeID:number})=>r.resultTypeID===2);
 const verified=match.matchIsFinished===true&&match.team1?.teamName===facts.home.name&&match.team2?.teamName===facts.away.name&&final?.pointsTeam1===facts.homeScore&&final?.pointsTeam2===facts.awayScore;
 report.candidate={facts,slug:publicationSlug(facts),fingerprint:fingerprint(stableFacts(facts)),ownerRecords:0,events:0,independentlyMatched:verified};}
 break;
 }}
 await db.query('ROLLBACK');await writeFile('output/v3-qa/v36/result-preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.end();}
