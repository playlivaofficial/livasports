import {requestOwnerSession} from '@/owner/session';
import {boundedJson} from '@/http/body';
import {withAutomation} from '@/editorial/automation/server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
export async function GET(request:Request){
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  try{return reply({...(await withAutomation(repo=>repo.dashboard())),enabled:process.env.V3_NEWS_AUTOMATION_ENABLED==='true',modelEnabled:process.env.V3_NEWS_MODEL_ENABLED==='true',modelConfigured:!!process.env.OPENAI_API_KEY?.trim(),budgetMode:process.env.V3_NEWS_BUDGET_MODE==='production'?'production':'validation'});}catch{return reply({error:'AUTOMATION_STORAGE_UNAVAILABLE'},503);}
}
export async function POST(request:Request){
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  const url=new URL(request.url);
  if(url.search||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin'||(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)))return reply({error:'INVALID_ORIGIN'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  try{
    const input=await boundedJson(request,2048) as Record<string,unknown>;
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['paused','sourceId','disabled'].includes(k))||!(typeof input.paused==='boolean'&&Object.keys(input).length===1||typeof input.sourceId==='string'&&typeof input.disabled==='boolean'&&Object.keys(input).length===2))return reply({error:'INVALID_REQUEST'},400);
    await withAutomation(repo=>repo.control(input));return reply({saved:true});
  }catch{return reply({error:'CONTROL_NOT_SAVED'},400);}
}
