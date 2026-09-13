import 'server-only';
import {timingSafeEqual} from 'node:crypto';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {runOddsScheduler,safeSchedulerError,schedulerHealth} from './scheduler';
import {runScoreTicker} from '@/ingestion/score-ticker';
import {NextCacheInvalidator} from '@/cache/next-invalidation';

export function authorizedScheduler(request:Request,secret=process.env.CRON_SECRET){
  const value=request.headers.get('authorization');
  if(!secret||secret.length<32||!value)return false;
  const expected=Buffer.from(`Bearer ${secret}`);const supplied=Buffer.from(value);
  return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
let db:PostgresDatabaseClient|undefined;
function database(){const url=databaseUrl();if(!url)throw new Error('ODDS_DATABASE_UNAVAILABLE');return db??=new PostgresDatabaseClient(url);}
export async function schedulerResponse(request:Request,health=false){
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
  if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  const automatic=process.env.ODDS_AUTOMATION_ENABLED==='true';
  // Preview builds can inspect health but never mutate the shared production database.
  if(!health&&process.env.VERCEL_ENV==='preview')return Response.json({error:'PREVIEW_REFRESH_DISABLED'},{status:403,headers});
  if(!health&&request.method==='GET'&&!automatic)return Response.json({state:'READY',automationEnabled:false,error:'AUTOMATION_NOT_ACTIVATED'},{status:503,headers});
  try{
    if(health)return Response.json(await schedulerHealth(database(),automatic),{headers});
    const started=Date.now();
    const result=await runOddsScheduler(database(),process.env.ODDSPAPI_API_KEY!,request.method==='GET'?'AUTOMATIC':'CONTROLLED');
    const scores=request.method==='GET'&&Date.now()-started<140000
      ?await runScoreTicker(database(),process.env.SPORTMONKS_API_KEY,new NextCacheInvalidator(true)).catch(()=>({state:'FAILED',providerRequests:0,error:'SCORES_SYNC_FAILED'})):undefined;
    console.info(`[LivaSports M5.1] ${JSON.stringify({event:'odds-scheduler',state:result.state,trigger:result.trigger,requests:result.requests,error:result.error})}`);
    return Response.json({...result,...(scores?{scores}:{})},{status:['FAILED','BUDGET_STOPPED'].includes(result.state)?503:200,headers});
  }catch(error){const code=safeSchedulerError(error);return Response.json({error:code},{status:code==='ODDS_WORKER_ALREADY_RUNNING'?409:503,headers});}
}
