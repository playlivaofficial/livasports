import {boundedJson} from '@/http/body';
import {requestOwnerSession} from '@/owner/session';
import type {NewsRepository} from './repository';
import {safeNewsDraft} from './model';

const privateHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:privateHeaders});
type Dependencies={withRepository:<T>(work:(repo:NewsRepository)=>Promise<T>)=>Promise<T>;invalidate:(slug:string)=>void};
export async function newsroomRequest(request:Request,deps:Dependencies):Promise<Response>{
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  const url=new URL(request.url);
  if(url.search)return reply({error:'INVALID_REQUEST'},400);
  if(request.method==='GET'){
    try{return reply({records:await deps.withRepository(repo=>repo.listOwner())});}catch{return reply({error:'NEWSROOM_UNAVAILABLE'},503);}
  }
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin'||(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)))return reply({error:'INVALID_ORIGIN'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  let body:Record<string,unknown>;
  try{body=await boundedJson(request,64000) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','slug','revision','draft','confirmed'].includes(key))||!['create','save','review','publish','archive'].includes(String(body.action))||typeof body.slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)||body.slug.length>100||!Number.isSafeInteger(body.revision)||Number(body.revision)<0)return reply({error:'INVALID_REQUEST'},400);
  if(['create','save'].includes(String(body.action))&&!safeNewsDraft(body.draft))return reply({error:'INVALID_DRAFT'},400);
  if(body.action==='review'&&body.confirmed!==true)return reply({error:'SOURCE_REVIEW_REQUIRED'},400);
  try{
    const record=await deps.withRepository(repo=>repo.mutate(body as unknown as Parameters<NewsRepository['mutate']>[0]));
    if(body.action==='publish'||body.action==='archive')deps.invalidate(record.slug);
    return reply({record});
  }catch(error){
    const reason=error instanceof Error?error.message:'';
    const statuses:Record<string,number>={REVISION_CONFLICT:409,NOT_FOUND:404,INVALID_DRAFT:400,SLUG_IMMUTABLE:400,REVIEW_REQUIRED:409,RATE_LIMITED:429};
    return reply({error:statuses[reason]?reason:'NEWSROOM_UNAVAILABLE'},statuses[reason]??503);
  }
}
