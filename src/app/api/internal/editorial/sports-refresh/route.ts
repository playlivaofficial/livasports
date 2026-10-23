import {timingSafeEqual} from 'node:crypto';
import {withSportsRepository} from '@/multisport/server';
import {runOpenLigaDbRefresh} from '@/multisport/refresh';
import {invalidateSports} from '@/multisport/invalidate';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET?.trim(),value=request.headers.get('authorization')??'',wanted=expected?`Bearer ${expected}`:'';
 if(!expected||Buffer.byteLength(value)!==Buffer.byteLength(wanted)||!timingSafeEqual(Buffer.from(value),Buffer.from(wanted)))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 if(process.env.V3_OPENLIGA_AUTOMATION_ENABLED!=='true')return Response.json({status:'disabled',requests:0},{headers});
 try{const result=await withSportsRepository(repo=>runOpenLigaDbRefresh(repo));if(result.status==='published')invalidateSports();return Response.json(result,{headers,status:result.status==='failed'?503:200});}catch{return Response.json({status:'failed',error:'SPORTS_STORAGE_UNAVAILABLE'},{status:503,headers});}
}
