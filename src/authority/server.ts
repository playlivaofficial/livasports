import 'server-only';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '@/database/client';
import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {boundedJson} from '@/slip/server';
import {authorityMutation,readAuthority} from './repository';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export function authorityDatabase(){const url=databaseUrl();if(!url)throw Error('DATABASE_UNAVAILABLE');return new PostgresDatabaseClient(url);}
export async function authorityGet(request:Request,database:()=>DatabaseClient=authorityDatabase){
 if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);if(new URL(request.url).search)return reply({error:'INVALID_REQUEST'},400);
 let db:DatabaseClient|undefined;try{db=database();return reply(await readAuthority(db));}catch{return reply({error:'AUTHORITY_UNAVAILABLE'},503);}finally{await db?.close();}
}
export async function authorityPost(request:Request,database:()=>DatabaseClient=authorityDatabase){
 const url=new URL(request.url);if(url.search||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin')return reply({error:'INVALID_ORIGIN'},403);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return reply({error:'HTTPS_REQUIRED'},403);
 const session=requestOwnerSession(request.headers);if(!session)return reply({error:'UNAUTHORIZED'},401);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
 let body:Record<string,unknown>;try{body=await boundedJson(request,18000) as Record<string,unknown>;if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return reply({error:'INVALID_REQUEST'},400);}
 const allowed:Record<string,string[]>={create:['name','url','category','angle','contactUrl','email','targetUrl','notes','followUpOn','research','isQa'],edit:['id','name','category','angle','contactUrl','email','targetUrl','notes','followUpOn','research'],status:['id','status','confirmSent','note'],'follow-up':['id','date'],link:['id','sourceUrl','targetUrl','note']};
 const keys=allowed[String(body.action)];if(!keys||Object.keys(body).some(k=>k!=='action'&&!keys.includes(k)))return reply({error:'INVALID_REQUEST'},400);
 let db:DatabaseClient|undefined;try{db=database();return reply(await authorityMutation(db,body,session.id));}
 catch(e){const code=e instanceof Error?e.message:'';const safe=['INVALID_INPUT','INVALID_URL','INVALID_TARGET','ACTIVITY_EVIDENCE_REQUIRED','INVALID_EVIDENCE_DOMAIN','INVALID_FOLLOW_UP','DUPLICATE_DOMAIN','DUPLICATE_LINK','NOT_FOUND','INVALID_TRANSITION','REJECTED_QUALITY','MANUAL_CONFIRMATION_REQUIRED','VERIFIED_LINK_REQUIRED','SOURCE_DOMAIN_MISMATCH'];return safe.includes(code)?reply({error:code},409):reply({error:'AUTHORITY_ACTION_FAILED'},503);}finally{await db?.close();}
}
