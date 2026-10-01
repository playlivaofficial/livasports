import {loadCompetition} from '@/sports/runtime';
import {sportsSeason} from '@/sports/policy';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Provider-Requests':'0'};
export async function GET(request:Request,context:{params:Promise<{slug:string}>}){
  const {slug}=await context.params;
  if(!/^[a-z0-9-]{1,80}$/.test(slug))return Response.json({error:'NOT_FOUND'},{status:404,headers});
  const query=new URL(request.url).searchParams,season=sportsSeason(query.get('season'));
  if(query.has('season')&&!season)return Response.json({error:'INVALID_SEASON'},{status:400,headers});
  const language=query.get('locale'),locale=language==='br'||language==='mx'?language:'en';
  try{
    const hub=await loadCompetition(slug,locale,season,1);
    if(!hub)return Response.json({error:'NOT_FOUND'},{status:404,headers});
    return Response.json({competitionId:hub.id,seasonId:hub.season?.id??null,standings:hub.standings,freshness:hub.standingsFreshness??null,providerRequests:0},{headers});
  }catch{return Response.json({error:'STANDINGS_UNAVAILABLE',providerRequests:0},{status:503,headers});}
}
