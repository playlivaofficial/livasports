import {resolveOddsDestination} from '@/odds/runtime';
import type {OddsMarket} from '@/odds/types';
import {validOutboundRequest} from '@/odds/affiliate';
export async function GET(request:Request,{params}:{params:Promise<{bookmaker:string}>}):Promise<Response>{
  const {bookmaker}=await params;const query=new URL(request.url).searchParams;
  const fixtureId=query.get('fixtureId')??'';const locale=query.get('locale');const market=query.get('market')??'';
  if(!validOutboundRequest(bookmaker,query))return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  try{const url=await resolveOddsDestination(fixtureId,locale as 'br'|'mx',bookmaker,market as OddsMarket);
    return url?new Response(null,{status:302,headers:{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}}):new Response(null,{status:404});
  }catch{return new Response(null,{status:503});}
}
