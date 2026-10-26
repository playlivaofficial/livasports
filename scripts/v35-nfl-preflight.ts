/** Read-only local preflight. No model calls, scheduler claims, queue writes or publication. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {collectPrimaryFeed} from '../src/editorial/primary-feed-discovery';
import {announcementErrors} from '../src/editorial/automation/announcements';
import {publicationSlug} from '../src/editorial/automation/policy';
const sql=(input:string)=>{const r=spawnSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,'LOCAL_READ_FAILED');return r.stdout.trim();};
assert.equal(sql('SELECT current_database()'),'livasports_v3_qa');assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
assert.equal(sql("SELECT count(*) FROM editorial_discovery_state WHERE source_id='nfl-cardinals' AND NOT disabled AND next_allowed_at<=now()"),'1','SOURCE_NOT_DUE');
let requests=0;const fetcher:typeof fetch=async(input,init)=>{assert.ok(++requests<=3);assert.ok(['www.azcardinals.com','azcardinals.com'].includes(new URL(String(input)).hostname));return fetch(input,init);};
const now=new Date(),found=await collectPrimaryFeed('nfl-cardinals',fetcher,now);
const facts=('announcements' in found?found.announcements:[])?.find(f=>f.detail.type==='team-honor');
const report:Record<string,unknown>={at:now.toISOString(),requests,collectorStatus:found.status,modelCalls:0,databaseWrites:0,newsroomPaused:true,publication:false,nextNewsRun:sql("SELECT max(started_at)+interval '6 hours' FROM editorial_automation_runs")};
if(facts){
 assert.deepEqual(announcementErrors(facts,now),[]);const literal="'"+facts.sourceUrl.replaceAll("'","''")+"'";
 const existing=Number(sql(`SELECT count(*) FROM editorial_news WHERE draft->>'sourceUrl'=${literal} OR published->>'sourceUrl'=${literal}`));
 const events=Number(sql(`SELECT count(*) FROM editorial_automation_events WHERE source_url=${literal}`));
 Object.assign(report,{facts,prospectiveSlug:publicationSlug(facts),existingOwnerRecordsIncludingArchived:existing,existingAutomationEvents:events,status:existing?'OWNER_OR_DUPLICATE_RECORD':events?'EXISTING_EVENT_REVIEW_REQUIRED':'NEW_FACTS_VERIFIED_NOT_GENERATED'});
}else report.status='NO_NEW_ELIGIBLE_FACTS';
assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');await mkdir('output/v3-qa/v35/newsroom',{recursive:true});await writeFile('output/v3-qa/v35/newsroom/nfl-preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
