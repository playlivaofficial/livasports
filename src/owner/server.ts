import 'server-only';
import {authorizedOwnerKey,newOwnerSession,ownerConfigured,ownerCookie,ownerSessionSeconds,requestOwnerSession,signOwnerSession} from './session';
import {requestCountry} from '@/odds/commercial-geo';
import {boundedJson} from '@/slip/server';

export const ownerHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export function ownerStatus(request:Request){const session=requestOwnerSession(request.headers);return reply({configured:ownerConfigured(),authorized:!!session,preview:session?.preview??false,realCountry:requestCountry(request.headers),expiresAt:session?.expiresAt??null});}
export async function ownerAction(request:Request){
  const url=new URL(request.url);
  if(url.search||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin')return reply({error:'INVALID_ORIGIN'},403);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return reply({error:'HTTPS_REQUIRED'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  let body:Record<string,unknown>;try{body=await boundedJson(request,2048) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST'},400);}
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','key','enabled'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
  if(!ownerConfigured())return reply({error:'OWNER_QA_NOT_CONFIGURED'},503);
  let session=requestOwnerSession(request.headers);
  if(body.action==='login'){
    if(!authorizedOwnerKey(body.key))return reply({error:'INVALID_ACCESS_KEY'},401);
    session=newOwnerSession();
  }else if(!session)return reply({error:'UNAUTHORIZED'},401);
  else if(body.action==='preview'&&typeof body.enabled==='boolean')session={...session,preview:body.enabled};
  else if(body.action!=='logout')return reply({error:'INVALID_REQUEST'},400);
  const logout=body.action==='logout',response=reply({authorized:!logout,preview:!logout&&session!.preview});
  const seconds=logout?0:Math.min(ownerSessionSeconds,Math.floor((session!.expiresAt-Date.now())/1000));
  response.headers.set('Set-Cookie',`${ownerCookie}=${logout?'':signOwnerSession(session!)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`);
  return response;
}
