import 'server-only';
import {authorizedOwnerKey,newOwnerSession,ownerConfigured,ownerCookie,ownerSessionSeconds,requestOwnerSession,signOwnerSession} from './session';
import {requestCountry} from '@/odds/commercial-geo';
import {boundedJson} from '@/slip/server';
import {productionOwnerLoginLimiter,type OwnerLoginLimiter} from './rate-limit';
import {isCoreGeo} from '@/config/geo';

export const ownerHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export function ownerStatus(request:Request){const session=requestOwnerSession(request.headers);return reply({configured:ownerConfigured(),authorized:!!session,preview:session?.preview??false,previewGeo:session?.previewGeo??null,realCountry:requestCountry(request.headers),expiresAt:session?.expiresAt??null});}
export async function ownerAction(request:Request,limiter:OwnerLoginLimiter=productionOwnerLoginLimiter){
  const url=new URL(request.url);
  if(url.search||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin')return reply({error:'INVALID_ORIGIN'},403);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return reply({error:'HTTPS_REQUIRED'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  let body:Record<string,unknown>;try{body=await boundedJson(request,2048) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST'},400);}
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','key','enabled','geo'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
  if(!ownerConfigured())return reply({error:'OWNER_QA_NOT_CONFIGURED'},503);
  let session=requestOwnerSession(request.headers);
  if(body.action==='login'){
    let retry:number|null;try{retry=await limiter.check(request);}catch{return reply({error:'LOGIN_TEMPORARILY_UNAVAILABLE'},503);}
    if(retry){const response=reply({error:'TOO_MANY_ATTEMPTS'},429);response.headers.set('Retry-After',String(retry));return response;}
    if(!authorizedOwnerKey(body.key)){
      try{retry=await limiter.failure(request);}catch{return reply({error:'LOGIN_TEMPORARILY_UNAVAILABLE'},503);}
      if(retry){const response=reply({error:'TOO_MANY_ATTEMPTS'},429);response.headers.set('Retry-After',String(retry));return response;}
      return reply({error:'INVALID_ACCESS_KEY'},401);
    }
    try{await limiter.success(request);}catch{return reply({error:'LOGIN_TEMPORARILY_UNAVAILABLE'},503);}
    session=newOwnerSession();
  }else if(!session)return reply({error:'UNAUTHORIZED'},401);
  else if(body.action==='preview'&&(body.geo===null||isCoreGeo(body.geo)))session={...session,preview:body.geo!==null,previewGeo:body.geo};
  else if(body.action==='preview'&&body.enabled===false)session={...session,preview:false,previewGeo:null};
  else if(body.action!=='logout')return reply({error:'INVALID_REQUEST'},400);
  const logout=body.action==='logout',response=reply({authorized:!logout,preview:!logout&&session!.preview});
  const seconds=logout?0:Math.min(ownerSessionSeconds,Math.floor((session!.expiresAt-Date.now())/1000));
  response.headers.set('Set-Cookie',`${ownerCookie}=${logout?'':signOwnerSession(session!)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`);
  return response;
}
