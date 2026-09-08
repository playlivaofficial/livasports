import { loadMatchCenter } from '@/match-center/runtime';

export async function GET(request:Request,{params}:{params:Promise<{publicId:string}>}){
  const locale=new URL(request.url).searchParams.get('locale')==='mx'?'mx':'br';
  const {publicId}=await params;if(!/^[a-f0-9]{16}$/i.test(publicId))return Response.json({error:'not_found'},{status:404});
  try{const result=await loadMatchCenter(publicId.toLowerCase(),locale);if(result.kind==='not-found')return Response.json({error:'not_found'},{status:404});
    return Response.json({publicId:result.match.header.publicId,status:result.match.header.status,snapshotAt:result.match.snapshotAt,
      providerUpdatedAt:result.match.header.providerUpdatedAt,providerRequests:0});
  }catch{return Response.json({error:'temporarily_unavailable'},{status:503});}
}
