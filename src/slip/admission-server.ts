import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readPublicOddsFixtures} from '@/odds/read-repository';
import {requestCommercialGeo} from '@/odds/commercial-geo';
import {canonicalSelection,selectionKey} from './types';
import {boundedJson} from './server';
import {selectablePrices} from './selection-lock';
import {selectionSigningKey,signSelection} from './selection-receipt';
import type {SlipFixtureRead} from './resolution';
import type {CommercialGeo} from '@/odds/commercial-geo';

let db:PostgresDatabaseClient|null=null;
async function read(ids:readonly string[],geo:CommercialGeo){const url=databaseUrl();if(!url)throw Error('DATABASE_UNAVAILABLE');db??=new PostgresDatabaseClient(url);return readPublicOddsFixtures(db,ids,geo);}
export async function selectSlipRequest(request:Request,reader:(ids:readonly string[],geo:CommercialGeo)=>Promise<Map<string,SlipFixtureRead>>=read,now=Date.now(),key=selectionSigningKey()):Promise<Response>{
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return reply({error:'INVALID_ORIGIN',providerRequests:0},403);
  if(url.search||request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST',providerRequests:0},400);
  let input:Record<string,unknown>;
  try{input=await boundedJson(request,4096) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST',providerRequests:0},400);}
  if(!input||Object.keys(input).some(k=>!['locale','selection','bookmaker','decimalOdds'].includes(k)))return reply({error:'INVALID_REQUEST',providerRequests:0},400);
  const selection=canonicalSelection(input.selection,true),geo=requestCommercialGeo(request.headers);
  if(!selection||typeof input.bookmaker!=='string'||typeof input.decimalOdds!=='string'||!Number.isFinite(Number(input.decimalOdds))||Number(input.decimalOdds)<=1||Number(input.decimalOdds)>1000)return reply({error:'INVALID_SELECTION',providerRequests:0},400);
  if(!geo||String(input.locale).toUpperCase()!==geo)return reply({error:'NO_VERIFIED_GEO',providerRequests:0},403);
  if(!key)return reply({error:'TEMPORARILY_UNAVAILABLE',providerRequests:0},503);
  try{
    // Admission always reads persisted provider truth, never the navigation/cache snapshot.
    const fixture=(await reader([selection.fixturePublicId],geo)).get(selection.fixturePublicId)??null;
    const price=selectablePrices(selection,fixture,now).find(p=>p.bookmaker===input.bookmaker&&Number(p.decimalOdds)===Number(input.decimalOdds));
    if(!price)return reply({error:'QUOTE_UNAVAILABLE_OR_CHANGED',providerRequests:0},409);
    const quote=fixture!.snapshot.quotes.find(q=>q.quoteId===price.sourceQuoteId&&q.bookmaker===price.bookmaker)!;
    const expires=Math.min(Date.parse(price.expiresAt),Date.parse(fixture!.fixture.kickoff));
    // Reject a price that expired while the database read was outstanding.
    if(expires<=Math.max(now,Date.now()))return reply({error:'QUOTE_EXPIRED',providerRequests:0},409);
    const receipt=signSelection({v:1,key:selectionKey(selection),geo,book:price.bookmaker,quote:quote.quoteId,provider:quote.provider??'ODDSPAPI',price:price.decimalOdds,observed:price.sourceObservedAt!,expires},key);
    return reply({selection:{...selection,receipt},price:{decimalOdds:price.decimalOdds,bookmaker:price.bookmaker,expiresAt:new Date(expires).toISOString()},providerRequests:0});
  }catch{return reply({error:'TEMPORARILY_UNAVAILABLE',providerRequests:0},503);}
}
