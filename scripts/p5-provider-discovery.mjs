// Explicit server-side P5 discovery. No application imports, live requests or automatic retries.
import {readFile,writeFile} from 'node:fs/promises';
import {OddsPapiAdapter} from '../src/provider/OddsPapiAdapter.js';

const file='output/p5-provider-discovery-private.json';
const resume=process.argv.includes('--resume');
const state=resume?JSON.parse(await readFile(file,'utf8')):{at:new Date().toISOString(),requests:[],account:null,bookmakers:null};
const provider=new OddsPapiAdapter({apiKey:process.env.ODDSPAPI_API_KEY,maxBillableRequests:1,
  fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})});
try {
  if(!state.account){
    const account=await provider.request('/account',{}, {billable:false});
    state.account={subscriptions:(account.subscriptions??[]).filter(s=>s.is_active).map(s=>({
      is_active:s.is_active,valid_from:s.valid_from,valid_until:s.valid_until,request_limit:s.request_limit,
      request_count:s.request_count,sport_ids:s.sport_ids,bookmakers:s.bookmakers,
    }))};
    state.requests.push({endpoint:'/v4/account',billable:false,status:200,at:new Date().toISOString()});
    await writeFile(file,JSON.stringify(state,null,2));
  }
  const active=state.account.subscriptions;
  if(active.length!==1||!active[0].sport_ids?.includes(10)||active[0].request_limit!==5000||
    active[0].request_count>=active[0].request_limit)throw new Error('ACCOUNT_SCOPE_OR_BUDGET_UNVERIFIED');
  if(!state.bookmakers){
    const catalog=await provider.request('/bookmakers');
    state.bookmakers=catalog.filter(b=>/betsson|sportingbet|betboo|betano/i.test(`${b.bookmakerName} ${b.slug}`))
      .map(b=>({bookmakerName:b.bookmakerName,slug:b.slug,liveOdds:b.liveOdds,cloneOf:b.cloneOf??null}));
    state.requests.push({endpoint:'/v4/bookmakers',billable:true,status:200,at:new Date().toISOString()});
    await writeFile(file,JSON.stringify(state,null,2));
  }
  console.log(JSON.stringify(state,null,2));
}catch(error){
  const safe=typeof error?.toJSON==='function'?error.toJSON():{code:'P5_DISCOVERY_STOPPED'};
  console.error(JSON.stringify({error:safe,httpRequests:provider.totalHttpRequests,billableRequests:provider.billableRequests}));
  process.exitCode=1;
}
