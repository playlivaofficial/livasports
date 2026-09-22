import 'server-only';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '@/database/client';
import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {boundedJson} from '@/slip/server';
import {GROWTH_CHANNELS,type GrowthChannel} from './config';
import {readGrowthDashboard,regenerateGrowthPlatform,runGrowthGeneration} from './service';
import {transitionGrowthChannel} from './repository';
import type {GrowthChannelStatus} from './types';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export interface GrowthOwnerDependencies {
  database:()=>DatabaseClient;
  dashboard:typeof readGrowthDashboard;
  run:typeof runGrowthGeneration;
  transition:typeof transitionGrowthChannel;
  regeneratePlatform:typeof regenerateGrowthPlatform;
}
const productionDependencies:GrowthOwnerDependencies={database:()=>{
  const url=databaseUrl();if(!url)throw new Error('GROWTH_DATABASE_UNAVAILABLE');return new PostgresDatabaseClient(url);
},dashboard:readGrowthDashboard,run:runGrowthGeneration,transition:transitionGrowthChannel,regeneratePlatform:regenerateGrowthPlatform};

export async function growthOwnerStatus(request:Request,deps:GrowthOwnerDependencies=productionDependencies){
  if(new URL(request.url).search)return reply({error:'INVALID_REQUEST'},400);
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  let db:DatabaseClient;try{db=deps.database();}catch{return reply({error:'GROWTH_DATABASE_UNAVAILABLE'},503);}
  try{return reply({...await deps.dashboard(db),providerRequests:0});}catch{return reply({error:'GROWTH_READ_FAILED'},503);}finally{await db.close();}
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
  const allowed=action==='refresh'?['action']:action==='regenerate'?['action','fixtureId']:action==='regenerate-platform'?['action','itemId','channel']:action==='transition'?['action','itemId','channel','status']:[];
  if(!allowed.length||Object.keys(body).some(key=>!allowed.includes(key)))return reply({error:'INVALID_REQUEST'},400);
  let db:DatabaseClient;try{db=deps.database();}catch{return reply({error:'GROWTH_DATABASE_UNAVAILABLE'},503);}
  try{
    if(action==='refresh'){
      const result=await deps.run(db,'OWNER');return reply(result,result.state==='FAILED'?409:200);
    }
    if(action==='regenerate'){
      if(!uuid.test(String(body.fixtureId??'')))return reply({error:'INVALID_REQUEST'},400);
      const result=await deps.run(db,'OWNER',{forceFixtureId:String(body.fixtureId)});return reply(result,result.state==='FAILED'?409:200);
    }
    if(action==='regenerate-platform'){
      const channel=String(body.channel??'') as GrowthChannel;
      if(!uuid.test(String(body.itemId??''))||channel==='EDITORIAL'||!GROWTH_CHANNELS.includes(channel))return reply({error:'INVALID_REQUEST'},400);
      const result=await deps.regeneratePlatform(db,String(body.itemId),channel);return reply(result,result.state==='FAILED'?409:200);
    }
    const channel=String(body.channel??'') as GrowthChannel,status=String(body.status??'') as GrowthChannelStatus;
    if(!uuid.test(String(body.itemId??''))||!GROWTH_CHANNELS.includes(channel)||!['APPROVED','REJECTED','PUBLISHED'].includes(status))return reply({error:'INVALID_REQUEST'},400);
    const changed=await deps.transition(db,String(body.itemId),channel,status);
    return changed?reply({updated:true,itemId:body.itemId,channel,status}):reply({error:'INVALID_TRANSITION'},409);
  }catch{return reply({error:'GROWTH_ACTION_FAILED'},503);}finally{await db.close();}
}
