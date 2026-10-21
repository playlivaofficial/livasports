import {timingSafeEqual} from 'node:crypto';
import {withAutomation} from '@/editorial/automation/server';
import {runNewsAutomation} from '@/editorial/automation/runner';
import {invalidateNews} from '@/editorial/invalidate';
export const dynamic='force-dynamic';
export const maxDuration=180;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim(),expected=secret?`Bearer ${secret}`:'',actual=request.headers.get('authorization')??'';
  if(!secret||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  if(process.env.V3_NEWS_AUTOMATION_ENABLED!=='true')return Response.json({status:'disabled',requests:0},{headers});
  try{
    const result=await withAutomation(repo=>runNewsAutomation(repo,{key:process.env.V3_NEWS_MODEL_ENABLED==='true'?process.env.OPENAI_API_KEY:undefined,validationOnly:process.env.V3_NEWS_BUDGET_MODE!=='production'}));
    if(result.changed)invalidateNews();
    return Response.json(result,{headers,status:result.status==='failed'?503:200});
  }catch{return Response.json({error:'AUTOMATION_STORAGE_UNAVAILABLE'},{status:503,headers});}
}
