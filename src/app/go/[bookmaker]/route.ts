import {resolveOddsDestination} from '@/odds/runtime';
import {SELECTIONS,type OddsMarket} from '@/odds/types';
export async function GET(request:Request,{params}:{params:Promise<{bookmaker:string}>}):Promise<Response>{
  const {bookmaker}=await params;const query=new URL(request.url).searchParams;
  const fixtureId=query.get('fixtureId')??'';const locale=query.get('locale');const market=query.get('market')??'';
  if(!['betano.bet.br','betsson'].includes(bookmaker)||!/^[0-9a-f-]{36}$/i.test(fixtureId)||!['br','mx'].includes(locale??'')||!Object.hasOwn(SELECTIONS,market)||
    [...query.keys()].some(k=>!['fixtureId','locale','market'].includes(k)))return new Response(null,{status:404});
  try{const url=await resolveOddsDestination(fixtureId,locale as 'br'|'mx',bookmaker,market as OddsMarket);
    return url?new Response(null,{status:302,headers:{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}}):new Response(null,{status:404});
  }catch{return new Response(null,{status:503});}
}
