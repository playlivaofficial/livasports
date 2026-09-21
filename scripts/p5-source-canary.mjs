// Bounded, read-only, explicit provider validation. Cached responses prevent repeat quota use.
import {readFile,writeFile} from 'node:fs/promises';
import {OddsPapiAdapter} from '../src/provider/OddsPapiAdapter.js';

const books=['betsson','sportingbet.bet.br','betboo.bet.br','betano.bet.br'];
const account=JSON.parse(await readFile('output/p5-provider-discovery-private.json','utf8'));
const scope=account.account.subscriptions[0];
if(Date.now()-Date.parse(account.at)>3600000||scope.request_count>4900||
  books.some(book=>!scope.bookmakers[book]||scope.bookmakers[book].has_live_odds!==false)) {
  throw new Error('Fresh verified four-source entitlement required');
}
const adapter=new OddsPapiAdapter({apiKey:process.env.ODDSPAPI_API_KEY,maxBillableRequests:4,
  fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})});
const summary=[];
for(const bookmaker of books){
  const path=`output/p5-canary-${bookmaker}.json`;
  let cached;
  try{cached=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!cached){
    const query={bookmaker,tournamentIds:'325,390,27464,17',language:'en',verbosity:'3',oddsFormat:'decimal'};
    try{
      const data=await adapter.request('/odds-by-tournaments',query);
      cached={at:new Date().toISOString(),query,data};
      await writeFile(path,JSON.stringify(cached).split(process.env.ODDSPAPI_API_KEY).join('[REDACTED]'));
    }catch(error){
      console.error(JSON.stringify({error:typeof error.toJSON==='function'?error.toJSON():{code:'CANARY_FAILED'},requests:adapter.billableRequests}));
      process.exitCode=1;break;
    }
  }
  const rows=Array.isArray(cached.data)?cached.data:[];
  summary.push({bookmaker,at:cached.at,fixtures:rows.length,returnedBooks:[...new Set(rows.flatMap(r=>Object.keys(r.bookmakerOdds??{})))],
    example:rows[0]?{keys:Object.keys(rows[0]),bookKeys:Object.keys(rows[0].bookmakerOdds?.[bookmaker]??{}),
      markets:Object.keys(rows[0].bookmakerOdds?.[bookmaker]?.markets??{}),
      matchWinner:rows[0].bookmakerOdds?.[bookmaker]?.markets?.['101']}:null});
}
console.log(JSON.stringify({requests:adapter.billableRequests,summary},null,2));
