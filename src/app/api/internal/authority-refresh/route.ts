import {authorizedScheduler} from '@/odds/scheduler-server';
import {authorityDatabase} from '@/authority/server';
import {runAuthorityMonitor} from '@/authority/monitor';
export const runtime='nodejs';
export const maxDuration=180;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
async function respond(request:Request){
 if(!authorizedScheduler(request))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
 if(process.env.VERCEL_ENV==='preview')return Response.json({error:'PREVIEW_DISABLED'},{status:403,headers});
 const db=authorityDatabase();try{return Response.json(await runAuthorityMonitor(db),{headers});}catch{return Response.json({error:'AUTHORITY_UNAVAILABLE'},{status:503,headers});}finally{await db.close();}
}
export const GET=respond;
export const POST=respond;
