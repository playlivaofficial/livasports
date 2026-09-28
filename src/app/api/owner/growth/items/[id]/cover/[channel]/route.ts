import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readGrowthItem,readCanonicalAsset} from '@/growth/repository';
import {socialExportReady} from '@/growth/manual-publishing';
import {VIDEO_CHANNELS,type GrowthVideoChannel} from '@/growth/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;channel:string}>}){
  if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:ownerHeaders});
  const {id,channel:raw}=await params,channel=raw as GrowthVideoChannel,q=new URL(request.url).searchParams;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!VIDEO_CHANNELS.includes(channel)||[...q.keys()].some(k=>!['sha','download'].includes(k)))return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
  const url=databaseUrl();if(!url)return Response.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers:ownerHeaders});
  const db=new PostgresDatabaseClient(url);
  try{
    const item=await readGrowthItem(db,id);
    if(!item||!socialExportReady(item,channel))return Response.json({status:'blocked_for_review'},{status:409,headers:ownerHeaders});
    const a=item.platformAssets!.find(a=>a.channel===channel)!;
    if(q.get('sha')!==a.coverSha256)return Response.json({error:'STALE_ASSET'},{status:409,headers:ownerHeaders});
    const row=await readCanonicalAsset(db,id,'STORY_IMAGE');
    if(!row||row.sha256!==a.coverSha256)return Response.json({status:'blocked_for_review'},{status:409,headers:ownerHeaders});
    return new Response(new Uint8Array(row.data),{headers:{...ownerHeaders,'Content-Type':'image/png','Content-Length':String(row.data.length),'ETag':`"${a.coverSha256}"`,
      'Content-Disposition':`${q.get('download')==='1'?'attachment':'inline'}; filename="livasports_${channel.toLowerCase()}_${item.fixture.publicId}_cover.png"`}});
  }catch{return Response.json({status:'blocked_for_review',error:'COVER_UNAVAILABLE'},{status:503,headers:ownerHeaders});}finally{await db.close();}
}
