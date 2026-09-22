import {ImageResponse} from 'next/og';
import {requestOwnerSession} from '@/owner/session';
import {ownerHeaders} from '@/owner/server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readGrowthItem} from '@/growth/repository';
import {createSocialAssetElement,socialAssetSize} from '@/growth/asset';

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
    return new ImageResponse(createSocialAssetElement(item),{...socialAssetSize,headers:{...ownerHeaders,'Content-Disposition':`inline; filename="livasports-${item.fixture.publicId}-v${item.revision}.png"`}});
  }catch{return Response.json({error:'ASSET_RENDER_FAILED'},{status:500,headers:ownerHeaders});}
  finally{await db.close();}
}
