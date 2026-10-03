import 'server-only';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '@/database/client';
import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {boundedJson} from '@/slip/server';
import {GROWTH_CHANNELS,type GrowthChannel} from './config';
import {readGrowthDashboard,regenerateGrowthPlatform,runGrowthSelection,previewGrowthVideo} from './service';
import {transitionGrowthChannel} from './repository';
import type {GrowthChannelStatus} from './types';
import {markGrowthPosted,readPublishingOverview,type MarkPostedInput} from './manual-repository';
import {VIDEO_CHANNELS} from './config';
import {validExternalPostUrl} from './manual-publishing';
import {isCoreGeo} from '@/config/geo';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export interface GrowthOwnerDependencies {
  database:()=>DatabaseClient;
  dashboard:typeof readGrowthDashboard;
  run:typeof runGrowthSelection;
  transition:typeof transitionGrowthChannel;
  regeneratePlatform:typeof regenerateGrowthPlatform;
  preview?:typeof previewGrowthVideo;
  markPosted?:typeof markGrowthPosted;
}
const productionDependencies:GrowthOwnerDependencies={database:()=>{
  const url=databaseUrl();if(!url)throw new Error('GROWTH_DATABASE_UNAVAILABLE');return new PostgresDatabaseClient(url);
},dashboard:readGrowthDashboard,run:runGrowthSelection,transition:transitionGrowthChannel,regeneratePlatform:regenerateGrowthPlatform};

export async function growthOwnerStatus(request:Request,deps:GrowthOwnerDependencies=productionDependencies){
  const params=new URL(request.url).searchParams,geo=params.get('geo')??'MX';
  if([...params.keys()].some(k=>k!=='geo')||params.getAll('geo').length>1||!isCoreGeo(geo))return reply({error:'INVALID_REQUEST'},400);
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  let db:DatabaseClient;try{db=deps.database();}catch{return reply({error:'GROWTH_DATABASE_UNAVAILABLE'},503);}
  try{return reply({...await deps.dashboard(db,new Date(),geo),providerRequests:0});}catch{return reply({error:'GROWTH_READ_FAILED'},503);}finally{await db.close();}
}
export async function growthOwnerAction(request:Request,deps:GrowthOwnerDependencies=productionDependencies){
  const url=new URL(request.url);
  if(url.search||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin')return reply({error:'INVALID_ORIGIN'},403);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return reply({error:'HTTPS_REQUIRED'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  let body:Record<string,unknown>;
  try{body=await boundedJson(request,2048) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST'},400);}
  if(!body||Array.isArray(body))return reply({error:'INVALID_REQUEST'},400);
  const action=body.action;
  const allowed=action==='mark-posted'?['action','itemId','channel','sha256','creativeVersion','externalPostUrl','notes']:action==='refresh'?['action','geo']:action==='preview'?['action','fixtureId','channel']:action==='regenerate'?['action','fixtureId']:action==='regenerate-platform'?['action','itemId','channel']:action==='transition'?['action','itemId','channel','status']:[];
  if(!allowed.length||Object.keys(body).some(key=>!allowed.includes(key)))return reply({error:'INVALID_REQUEST'},400);
  // Deny before DB access: even a stale owner tab cannot restart media production.
  if(action==='regenerate'||action==='regenerate-platform')return reply({error:'MEDIA_GENERATION_DISABLED',providerRequests:0},410);
  let db:DatabaseClient;try{db=deps.database();}catch{return reply({error:'GROWTH_DATABASE_UNAVAILABLE'},503);}
  try{
    if(action==='mark-posted'){
      if(!uuid.test(String(body.itemId??''))||!VIDEO_CHANNELS.includes(body.channel as MarkPostedInput['channel'])
        ||typeof body.sha256!=='string'||!/^[a-f0-9]{64}$/.test(body.sha256)||typeof body.creativeVersion!=='string'||body.creativeVersion.length>150
        ||(body.notes!==undefined&&(typeof body.notes!=='string'||body.notes.length>500)))return reply({error:'INVALID_REQUEST'},400);
      try{validExternalPostUrl(body.externalPostUrl);}catch{return reply({error:'INVALID_POST_URL'},400);}
      try{return reply(await (deps.markPosted??markGrowthPosted)(db,body as unknown as MarkPostedInput,requestOwnerSession(request.headers)!.id));}
      catch(error){const code=error instanceof Error?error.message:'';if(['ALREADY_POSTED','STALE_OR_UNREADY_ASSET','POSTING_NOT_ALLOWED'].includes(code))return reply({error:code},409);throw error;}
    }
    if(action==='preview'){
      const channel=String(body.channel??'') as GrowthChannel;
      if(!uuid.test(String(body.fixtureId??''))||channel==='EDITORIAL'||!GROWTH_CHANNELS.includes(channel))return reply({error:'INVALID_REQUEST'},400);
      const video=await (deps.preview??previewGrowthVideo)(db,String(body.fixtureId),channel);
      return new Response(new Uint8Array(video.data),{headers:{...ownerHeaders,'Content-Type':'video/mp4','Content-Length':String(video.byteLength),
        'X-Growth-Voice':video.voice?.degradedReason??`${video.voice?.provider}:${video.voice?.lines}`,
        'X-Growth-Characters':video.renderMetadata?.characterMode??'NONE','X-Growth-Render-Ms':String(video.renderMetadata?.renderMs??0),'ETag':`"${video.sha256}"`}});
    }
    if(action==='refresh'){
      if(body.geo!==undefined&&!isCoreGeo(body.geo))return reply({error:'INVALID_GEO'},400);
      const result=await deps.run(db,'OWNER',body.geo?{geo:body.geo as import('@/config/geo').CoreGeo}:{});return reply(result,result.state==='FAILED'?409:200);
    }
    const channel=String(body.channel??'') as GrowthChannel,status=String(body.status??'') as GrowthChannelStatus;
    if(!uuid.test(String(body.itemId??''))||!GROWTH_CHANNELS.includes(channel)||!['APPROVED','REJECTED','PUBLISHED'].includes(status))return reply({error:'INVALID_REQUEST'},400);
    if(channel!=='EDITORIAL'&&status==='PUBLISHED')return reply({error:'USE_MARK_POSTED'},400);
    const changed=await deps.transition(db,String(body.itemId),channel,status);
    return changed?reply({updated:true,itemId:body.itemId,channel,status}):reply({error:'INVALID_TRANSITION'},409);
  }catch(error){
    // Owner-only diagnostics: stable machine codes, never raw errors, SQL, paths or credentials.
    const rawCode=(error as {code?:unknown})?.code;
    const code=typeof rawCode==='string'&&/^[A-Z0-9_]{2,64}$/.test(rawCode)?rawCode:
      error instanceof Error?/^([A-Z][A-Z0-9_]{1,63})(?=:|$)/.exec(error.message)?.[1]??'UNCLASSIFIED_ACTION_FAILURE':'UNCLASSIFIED_ACTION_FAILURE';
    console.error(JSON.stringify({event:'growth-owner-action-failed',action,code}));
    return reply({error:'GROWTH_ACTION_FAILED',code},503);
  }finally{await db.close();}
}

export async function growthPublishingHistory(request:Request){
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(k=>!['channel','fixture','version','date','state','offset'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
  const channel=query.get('channel')||undefined,fixture=query.get('fixture')||undefined,version=query.get('version')||undefined,date=query.get('date')||undefined,offset=Number(query.get('offset')??0);
  if((channel&&!VIDEO_CHANNELS.includes(channel as MarkPostedInput['channel']))||(fixture?.length??0)>100||(version?.length??0)>150
    ||(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))))||!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply({error:'INVALID_REQUEST'},400);
  const state=query.get('state')||'POSTED';if(!['POSTED','SUPERSEDED'].includes(state))return reply({error:'INVALID_REQUEST'},400);
  let db:DatabaseClient;try{db=productionDependencies.database();}catch{return reply({error:'GROWTH_DATABASE_UNAVAILABLE'},503);}
  try{return reply(await readPublishingOverview(db,{channel,fixture,version,date,state:state as 'POSTED'|'SUPERSEDED',offset}));}
  catch{return reply({error:'PUBLISHING_READ_FAILED'},503);}finally{await db.close();}
}
