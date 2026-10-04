import {loadOddsComparisons} from '@/odds/runtime';
import {commercialLocale,requestCommercialGeo} from '@/odds/commercial-geo';
import {publicOddsComparisons} from '@/odds/public-response';
export async function GET(request:Request,{params}:{params:Promise<{fixtureId:string}>}):Promise<Response>{
  const {fixtureId}=await params;const locale=new URL(request.url).searchParams.get('locale');
  if(!/^[0-9a-f-]{36}$/i.test(fixtureId)||(locale!=='br'&&locale!=='mx'&&locale!=='en'))return new Response(null,{status:400});
  try{
    const geo=requestCommercialGeo(request.headers);
    return Response.json({comparisons:publicOddsComparisons(await loadOddsComparisons(fixtureId,geo)),commercialLocale:commercialLocale(geo),providerRequests:0},{headers:{'Cache-Control':'no-store'}});
  }
  catch{return Response.json({error:'ODDS_TEMPORARILY_UNAVAILABLE',providerRequests:0},{status:503,headers:{'Cache-Control':'no-store'}});}
}
