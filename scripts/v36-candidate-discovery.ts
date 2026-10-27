/** Bounded, non-paid discovery: normalized public facts only, no database writes. */
import {collectPrimaryFeed} from '../src/editorial/primary-feed-discovery';
import {announcementErrors} from '../src/editorial/automation/announcements';
import {writeFile} from 'node:fs/promises';
const reports=[];
for(const id of ['nba-releases','dimayor-releases']){
 const result=await collectPrimaryFeed(id);
 reports.push({source:id,status:result.status,requests:result.requests,candidates:result.candidates,announcements:('announcements' in result?result.announcements:[])?.map(f=>({facts:f,errors:announcementErrors(f)}))??[]});
}
await writeFile('output/v3-qa/v36/candidate-discovery.json',JSON.stringify({at:new Date().toISOString(),modelCalls:0,reports},null,2));console.log(JSON.stringify(reports));
