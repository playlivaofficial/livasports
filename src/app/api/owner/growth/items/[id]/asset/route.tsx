import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readGrowthItem} from '@/growth/repository';
import {socialExportReady} from '@/growth/manual-publishing';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:ownerHeaders});
  const {id}=await params;if(!uuid.test(id))return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
  const url=databaseUrl();if(!url)return Response.json({error:'GROWTH_DATABASE_UNAVAILABLE'},{status:503,headers:ownerHeaders});
  const db=new PostgresDatabaseClient(url);
  try{
    const item=await readGrowthItem(db,id);if(!item)return Response.json({error:'NOT_FOUND'},{status:404,headers:ownerHeaders});
    if(!socialExportReady(item,'INSTAGRAM_REELS'))return Response.json({status:'blocked_for_review'},{status:409,headers:ownerHeaders});
    const sha=item.platformAssets!.find(a=>a.channel==='INSTAGRAM_REELS')!.coverSha256;
    return new Response(null,{status:307,headers:{...ownerHeaders,Location:`/api/owner/growth/items/${item.id}/cover/INSTAGRAM_REELS?sha=${sha}`}});
  }catch{return Response.json({error:'ASSET_RENDER_FAILED'},{status:500,headers:ownerHeaders});}
  finally{await db.close();}
}
