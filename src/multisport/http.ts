import {requestOwnerSession} from '@/owner/session';
import {boundedJson} from '@/http/body';
import {validateSnapshot} from './model';
import type {SportsRepository,SnapshotMutation} from './repository';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
type Dependencies={withRepository:<T>(work:(repo:SportsRepository)=>Promise<T>)=>Promise<T>;invalidate:()=>void};
export async function sportsOwnerRequest(request:Request,deps:Dependencies){
 if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
 const url=new URL(request.url);if(url.search)return reply({error:'INVALID_REQUEST'},400);
 try{
  if(request.method==='GET')return reply(await deps.withRepository(async repo=>({records:await repo.listOwner(),refresh:await repo.refreshStatus()})));
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin'||(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)))return reply({error:'INVALID_ORIGIN'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  let body:Record<string,unknown>;try{body=await boundedJson(request,2000000) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','key','revision','draft','confirmed'].includes(key))||typeof body.key!=='string'||!Number.isSafeInteger(body.revision)||!['create','save','review','publish','archive'].includes(String(body.action)))return reply({error:'INVALID_REQUEST'},400);
  if(['create','save'].includes(String(body.action))){const errors=validateSnapshot(body.draft);if(errors.length)return reply({error:'INVALID_SNAPSHOT',errors:errors.slice(0,12)},400);}
  if(body.action==='review'&&body.confirmed!==true)return reply({error:'SOURCE_REVIEW_REQUIRED'},400);
  const record=await deps.withRepository(repo=>repo.mutate(body as unknown as SnapshotMutation));
  if(body.action==='publish'||body.action==='archive')deps.invalidate();return reply({record});
 }catch(error){const reason=error instanceof Error?error.message:'';const status:Record<string,number>={REVISION_CONFLICT:409,NOT_FOUND:404,INVALID_SNAPSHOT:400,INVALID_MUTATION:400,REVIEW_REQUIRED:409,RATE_LIMITED:429};return reply({error:status[reason]?reason:'SPORTS_STORAGE_UNAVAILABLE'},status[reason]??503);}
}
