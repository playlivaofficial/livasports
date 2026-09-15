import {FOOTBALL_COMPETITION_TARGETS} from '../src/config/footballCompetitions';

const base=new URL(process.argv[2]??'http://localhost:3300');
const localePaths={br:'/br/futebol',mx:'/mx/futbol',en:'/en/football'} as const;
const tabs=['fixtures','results','standings','scorers','teams'] as const;
const jobs:URL[]=[];

for(const path of Object.values(localePaths))for(const competition of FOOTBALL_COMPETITION_TARGETS.filter(row=>row.enabled)){
  jobs.push(new URL(`${path}?competition=${competition.slug}`,base));
  for(const tab of tabs)jobs.push(new URL(`${path}?competition=${competition.slug}&tab=${tab}&season=invalid-season`,base));
}

const failures:Array<{path:string;status:number;reason:string}>=[];
let cursor=0;
async function worker(){
  while(cursor<jobs.length){
    const url=jobs[cursor++];
    try{
      const response=await fetch(url,{redirect:'manual'}),body=await response.text();
      const reason=response.status!==200?`HTTP_${response.status}`:/Unable to load this page|Application error/i.test(body)?'ERROR_BOUNDARY':'NONE';
      if(reason!=='NONE')failures.push({path:url.pathname+url.search,status:response.status,reason});
    }catch{failures.push({path:url.pathname+url.search,status:0,reason:'REQUEST_FAILED'});}
  }
}

await Promise.all(Array.from({length:6},worker));
const result={status:failures.length?'FAIL':'PASS',base:base.origin,competitions:FOOTBALL_COMPETITION_TARGETS.filter(row=>row.enabled).length,locales:Object.keys(localePaths).length,tabs:tabs.length,requests:jobs.length,routeCrashes:failures.filter(row=>row.reason==='ERROR_BOUNDARY').length,failures};
console.log(JSON.stringify(result));
if(failures.length)process.exitCode=1;
