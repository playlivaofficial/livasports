/** Local, manually invoked discovery. No env files, DB, cron, LLM or publication. */
import {mkdir,open,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {discoveryDesks,isDiscoveryArticleUrl,type DiscoveryCandidate} from '../src/editorial/discovery';
import {collectDiscovery} from '../src/editorial/discovery-collector';
const ids=process.argv.slice(2);if(!ids.length||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>!discoveryDesks.some(d=>d.id===id)))throw new Error('Choose 1–8 distinct approved desk IDs.');
const now=new Date(),directory=join('output','v3-news-discovery',now.toISOString().slice(0,10));await mkdir(directory,{recursive:true});
const candidates:DiscoveryCandidate[]=[];let requests=0;
for(const id of ids){
  const resultPath=join(directory,`${id}.json`);
  try{const claim=await open(join(directory,`${id}.claimed`),'wx');await claim.close();}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    try{candidates.push(...(JSON.parse(await readFile(resultPath,'utf8')).candidates as DiscoveryCandidate[]).filter(c=>isDiscoveryArticleUrl(c.desk,c.url)));}catch{/* An interrupted claim remains blocked until the next UTC day. */}
    console.log(JSON.stringify({desk:id,requests:0,status:'ALREADY_ATTEMPTED_TODAY'}));continue;
  }
  const result=await collectDiscovery(id,fetch,now);requests+=result.requests;candidates.push(...result.candidates);await writeFile(resultPath,JSON.stringify(result,null,2));console.log(JSON.stringify({desk:id,requests:result.requests,status:result.status,candidates:result.candidates.length}));
}
const packagePath=join(directory,'owner-candidates.json');await writeFile(packagePath,JSON.stringify({version:1,discoveredAt:now.toISOString(),candidates},null,2));
console.log(JSON.stringify({requests,package:packagePath,candidates:candidates.length,publication:false,productionWrites:0,providerFees:0}));
