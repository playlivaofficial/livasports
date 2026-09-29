import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {authorizedScheduler} from '@/odds/scheduler-server';
import {runSeoAutopilot} from '@/seo-autopilot/service';
export const runtime='nodejs';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:Request){
  if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  if(process.env.VERCEL_ENV==='preview')return Response.json({error:'PREVIEW_DISABLED'},{status:403,headers});
  const url=databaseUrl();if(!url)return Response.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers});
  const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:20_000});
  try{const result=await runSeoAutopilot(db);return Response.json(result,{status:result.state==='FAILED'?503:200,headers});}
  catch{return Response.json({error:'SEO_AUTOPILOT_FAILED',providerRequests:0},{status:503,headers});}
  finally{await db.close();}
}
export const POST=GET;
