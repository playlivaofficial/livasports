import {loadOddsComparisons} from '@/odds/runtime';
export async function GET(request:Request,{params}:{params:Promise<{fixtureId:string}>}):Promise<Response>{
  const {fixtureId}=await params;const locale=new URL(request.url).searchParams.get('locale');
  if(!/^[0-9a-f-]{36}$/i.test(fixtureId)||(locale!=='br'&&locale!=='mx'))return new Response(null,{status:400});
  try{return Response.json({comparisons:await loadOddsComparisons(fixtureId,locale),providerRequests:0},{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'ODDS_TEMPORARILY_UNAVAILABLE',providerRequests:0},{status:503,headers:{'Cache-Control':'no-store'}});}
}
