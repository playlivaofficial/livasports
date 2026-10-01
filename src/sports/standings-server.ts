import 'server-only';
import {authorizedScheduler} from '@/odds/scheduler-server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {NextCacheInvalidator} from '@/cache/next-invalidation';
import {runStandingsRefresh} from '@/sports/standings-refresh';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function standingsRefreshResponse(request:Request){
  if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(process.env.VERCEL_ENV==='preview')return Response.json({error:'PREVIEW_DISABLED'},{status:403,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  const url=databaseUrl();if(!url)return Response.json({error:'NOT_CONFIGURED'},{status:503,headers});
  const db=new PostgresDatabaseClient(url);
  try{return Response.json(await runStandingsRefresh(db,process.env.SPORTMONKS_API_KEY,new NextCacheInvalidator(true)),{headers});}
  catch{return Response.json({error:'STANDINGS_REFRESH_UNAVAILABLE'},{status:503,headers});}finally{await db.close();}
}
