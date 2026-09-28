import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readGrowthVideo,readGrowthItem} from '@/growth/repository';
import {currentAssetReady,videoFilename,socialExportReady} from '@/growth/manual-publishing';
import {isLatestGrowthItem} from '@/growth/manual-repository';
import {VIDEO_CHANNELS,type GrowthVideoChannel} from '@/growth/config';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request:Request,{params}:{params:Promise<{id:string;channel:string}>}){
  if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:ownerHeaders});
  const {id,channel:raw}=await params,channel=raw.toUpperCase() as GrowthVideoChannel;
  const query=new URL(request.url).searchParams;if(!uuid.test(id)||!VIDEO_CHANNELS.includes(channel)||[...query.keys()].some(key=>!['download','current','version','sha'].includes(key)))return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
  const url=databaseUrl();if(!url)return Response.json({error:'GROWTH_DATABASE_UNAVAILABLE'},{status:503,headers:ownerHeaders});
  const db=new PostgresDatabaseClient(url);
  try{const item=await readGrowthItem(db,id);if(!item)return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
    if(!socialExportReady(item,channel))return Response.json({status:'blocked_for_review',error:'SOCIAL_BLOCKED_FOR_REVIEW'},{status:409,headers:ownerHeaders});
    if(query.get('current')==='1'&&(!currentAssetReady(item,channel)||item.creativeVersion!==query.get('version')
      ||item.platformAssets?.find(a=>a.channel===channel)?.sha256!==query.get('sha')||!await isLatestGrowthItem(db,id)))return Response.json({error:'STALE_OR_UNREADY_ASSET'},{status:409,headers:ownerHeaders});
    const video=await readGrowthVideo(db,id,channel);if(!video)return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
    const disposition=query.get('download')==='1'?'attachment':'inline';
    return new Response(new Uint8Array(video.data),{headers:{...ownerHeaders,'Content-Type':'video/mp4','Content-Length':String(video.byteLength),
      'Content-Disposition':`${disposition}; filename="${videoFilename(item,channel)}"`,'Cache-Control':'private, no-store','ETag':`"${video.sha256}"`}});
  }catch{return Response.json({error:'VIDEO_READ_FAILED'},{status:500,headers:ownerHeaders});}finally{await db.close();}
}
