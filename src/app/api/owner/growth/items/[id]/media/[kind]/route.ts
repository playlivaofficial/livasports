import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readCanonicalAsset,readGrowthItem} from '@/growth/repository';
import {isLatestGrowthItem} from '@/growth/manual-repository';
import {CREATIVE_VERSION} from '@/growth/creative-version';
import type {GrowthAssetKind} from '@/growth/types';
import {socialExportReady} from '@/growth/manual-publishing';
import {VIDEO_CHANNELS} from '@/growth/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request,{params}:{params:Promise<{id:string;kind:string}>}){
  if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:ownerHeaders});
  const {id,kind}=await params,query=new URL(request.url).searchParams;
  if(!uuid.test(id)||!['MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE'].includes(kind)||[...query.keys()].some(k=>!['current','version','sha','download'].includes(k)))return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
  const url=databaseUrl();if(!url)return Response.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers:ownerHeaders});
  const db=new PostgresDatabaseClient(url);
  try{
    const item=await readGrowthItem(db,id),asset=item?.canonicalAssets?.find(a=>a.kind===kind);
    if(item&&!VIDEO_CHANNELS.every(channel=>socialExportReady(item,channel)))return Response.json({status:'blocked_for_review',error:'SOCIAL_BLOCKED_FOR_REVIEW'},{status:409,headers:ownerHeaders});
    if(!item||!asset)return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
    if(query.get('current')==='1'&&(item.supersededAt||asset.creativeVersion!==CREATIVE_VERSION||asset.creativeVersion!==query.get('version')||asset.sha256!==query.get('sha')||!await isLatestGrowthItem(db,id)))return Response.json({error:'STALE_OR_UNREADY_ASSET'},{status:409,headers:ownerHeaders});
    const media=await readCanonicalAsset(db,id,kind as GrowthAssetKind);if(!media)return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
    const filename=`livasports_${item.fixture.publicId}_r${item.revision}_${kind.toLowerCase()}.${kind==='MASTER_VIDEO'?'mp4':'png'}`;
    return new Response(new Uint8Array(media.data),{headers:{...ownerHeaders,'Content-Type':media.mimeType,'Content-Length':String(media.byteLength),
      'Content-Disposition':`${query.get('download')==='1'?'attachment':'inline'}; filename="${filename}"`,'ETag':`"${media.sha256}"`}});
  }catch{return Response.json({error:'MEDIA_READ_FAILED'},{status:500,headers:ownerHeaders});}finally{await db.close();}
}
