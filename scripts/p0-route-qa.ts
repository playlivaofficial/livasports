import {FOOTBALL_COMPETITION_TARGETS} from '../src/config/footballCompetitions';

const base=new URL(process.argv[2]??'http://localhost:3300');
const localePaths={br:'/br/futebol',mx:'/mx/futbol',en:'/en/football'} as const;
const tabs=['fixtures','results','standings','scorers','teams'] as const;
type Job={url:URL;expectedTab:typeof tabs[number]};
const failures:Array<{path:string;status:number;reason:string}>=[];
const jobs:Job[]=[];
let requests=0;
async function read(job:Job){
  requests++;
  try{
    const response=await fetch(job.url,{redirect:'manual'}),body=await response.text();
    const active=new RegExp(`data-competition-tab=["']${job.expectedTab}["'][^>]*aria-current=["']page["']|aria-current=["']page["'][^>]*data-competition-tab=["']${job.expectedTab}["']`).test(body);
    const reason=response.status!==200?`HTTP_${response.status}`:/Unable to load this page|Application error/i.test(body)?'ERROR_BOUNDARY':!active?'WRONG_ACTIVE_TAB':'NONE';
    if(reason!=='NONE')failures.push({path:job.url.pathname+job.url.search,status:response.status,reason});
    return body;
  }catch{failures.push({path:job.url.pathname+job.url.search,status:0,reason:'REQUEST_FAILED'});return '';}
}
async function discover(path:string,slug:string){
  const url=new URL(`${path}?competition=${slug}`,base),body=await read({url,expectedTab:'fixtures'});
  const seasons=[...body.matchAll(/<option[^>]+value=["']([a-f0-9-]{36})["']/gi)].map(match=>match[1]);
  const unique=[...new Set(seasons)];
  for(const tab of tabs){
    for(const season of ['invalid-season',unique[0],unique[1]??unique[0]].filter((value):value is string=>!!value)){
      jobs.push({url:new URL(`${path}?competition=${slug}&tab=${tab}&season=${season}`,base),expectedTab:tab});
    }
  }
}

const targets=FOOTBALL_COMPETITION_TARGETS.filter(row=>row.enabled);
const discoveryJobs=Object.values(localePaths).flatMap(path=>targets.map(competition=>({path,slug:competition.slug})));
let discoveryCursor=0;
async function discoveryWorker(){while(discoveryCursor<discoveryJobs.length){const job=discoveryJobs[discoveryCursor++];await discover(job.path,job.slug);}}
await Promise.all(Array.from({length:6},discoveryWorker));
let cursor=0;
async function worker(){while(cursor<jobs.length)await read(jobs[cursor++]);}
await Promise.all(Array.from({length:6},worker));
const result={status:failures.length?'FAIL':'PASS',base:base.origin,competitions:targets.length,locales:Object.keys(localePaths).length,tabs:tabs.length,requests,routeCrashes:failures.filter(row=>row.reason==='ERROR_BOUNDARY').length,failures};
console.log(JSON.stringify(result));
if(failures.length)process.exitCode=1;
