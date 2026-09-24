import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {authorizedScheduler} from '@/odds/scheduler-server';
import {runSeoMonitor} from '@/seo/monitoring-server';

export const runtime='nodejs';
export const maxDuration=120;

let db:PostgresDatabaseClient|undefined;
function database(){const url=databaseUrl();if(!url)throw new Error('SEO_DATABASE_UNAVAILABLE');return db??=new PostgresDatabaseClient(url);}
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};

/**
 * Daily SEO monitor. Same bearer auth as the other internal schedulers, idempotent per day, and it only
 * ever fetches our own origin — no provider budget and no Search Console credential involved.
 */
async function respond(request:Request){
  if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  if(process.env.VERCEL_ENV==='preview')return Response.json({error:'PREVIEW_REFRESH_DISABLED'},{status:403,headers});
  try{
    const result=await runSeoMonitor(database());
    console.info(`[LivaSports SEO] ${JSON.stringify({event:'seo-monitor',...result})}`);
    // A completed run answers 200 in every state; failures are reported through the owner dashboard.
    return Response.json(result,{headers});
  }catch{return Response.json({error:'SEO_MONITOR_FAILED',providerRequests:0},{status:503,headers});}
}
export const GET=respond;
export const POST=respond;
