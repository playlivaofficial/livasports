import {legacyOutbound,commercialHeaders} from '@/affiliate/server';
import {affiliateDatabase} from '@/affiliate/runtime';
import {matchPath} from '@/match-center/routes';
import type {OddsMarket} from '@/odds/types';
import {validOutboundRequest} from '@/odds/affiliate';
export async function GET(request:Request,{params}:{params:Promise<{bookmaker:string}>}):Promise<Response>{
  const {bookmaker}=await params;const query=new URL(request.url).searchParams;
  const fixtureId=query.get('fixtureId')??'';const locale=query.get('locale');const market=query.get('market')??'';
  if(request.url.length>4096||!validOutboundRequest(bookmaker,query))return new Response(null,{status:404,headers:commercialHeaders});
  try{const r=(await affiliateDatabase().query(`SELECT f.public_id,h.name AS home,a.name AS away FROM fixtures f JOIN teams h ON h.id=f.home_team_id JOIN teams a ON a.id=f.away_team_id WHERE f.id=$1`,[fixtureId])).rows[0];
    if(!r)return new Response(null,{status:404,headers:commercialHeaders});const geo=locale as 'br'|'mx';
    return legacyOutbound(request,{locale:geo,bookmaker:bookmaker as 'betsson'|'betano.bet.br',placement:'match_odds_table',fixturePublicId:r.public_id,market:market as OddsMarket,pagePath:matchPath(geo,r.public_id,r.home,r.away)});
  }catch{return new Response(null,{status:503,headers:commercialHeaders});}
}
export async function HEAD(){return new Response(null,{status:204,headers:commercialHeaders});}
