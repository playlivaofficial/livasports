import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {authorizedScheduler} from '@/odds/scheduler-server';
import {runGrowthSelection} from './service';

let db:PostgresDatabaseClient|undefined;
function database(){const url=databaseUrl();if(!url)throw new Error('GROWTH_DATABASE_UNAVAILABLE');return db??=new PostgresDatabaseClient(url);}
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};

export async function growthSchedulerResponse(request:Request){
  if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  if(process.env.VERCEL_ENV==='preview')return Response.json({error:'PREVIEW_REFRESH_DISABLED'},{status:403,headers});
  try{
    const result=await runGrowthSelection(database(),request.method==='GET'?'AUTOMATIC':'OWNER');
    console.info(`[LivaSports Traffic] ${JSON.stringify({event:'growth-selection',...result})}`);
    return Response.json(result,{headers});
  }catch{return Response.json({error:'GROWTH_SELECTION_FAILED',mediaGeneration:'DISABLED',providerRequests:0},{status:503,headers});}
}
