import {timingSafeEqual} from 'node:crypto';
import {withAutomation} from '@/editorial/automation/server';
import {runNewsAutomation} from '@/editorial/automation/runner';
import {invalidateNews} from '@/editorial/invalidate';
import {parseCanary} from '@/editorial/automation/canary';
import {beginInvocation,finishInvocation} from '@/editorial/automation/invocations';
export const dynamic='force-dynamic';
export const maxDuration=180;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim(),expected=secret?`Bearer ${secret}`:'',actual=request.headers.get('authorization')??'';
  if(!secret||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
  if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
  try{
    const canary=parseCanary(process.env.V3_NEWS_CANARY);
    const result=await withAutomation(async repo=>{
      // Authenticate first; persist the start before any paid work. A crash remains visibly incomplete.
      const invocation=await beginInvocation(repo.db,request.headers.get('user-agent'));
      let result:Awaited<ReturnType<typeof runNewsAutomation>>|{status:string;requests:number;changed?:boolean;runId?:string}={status:'failed',requests:0};
      let cache:'not-needed'|'requested'|'failed'|'not-reached'='not-reached';
      try{
        result=process.env.V3_NEWS_AUTOMATION_ENABLED==='true'?await runNewsAutomation(repo,{key:process.env.V3_NEWS_MODEL_ENABLED==='true'?process.env.OPENAI_API_KEY:undefined,validationOnly:!!canary||process.env.V3_NEWS_BUDGET_MODE!=='production'}):{status:'disabled',requests:0};
        cache='not-needed';
        if(result.changed){cache='failed';invalidateNews();cache='requested';}
        return result;
      }finally{await finishInvocation(repo.db,invocation,result,cache);}
    },canary);
    return Response.json(result,{headers,status:result.status==='failed'?503:200});
  }catch{return Response.json({error:'AUTOMATION_STORAGE_UNAVAILABLE'},{status:503,headers});}
}
