import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readSlipComparison,type SlipComparisonRead} from '@/odds/read-repository';
import type {SiteLocale} from '@/config/i18n';
import {boundedJson} from './server';
import {parseResolutionRequest,type CanonicalSelection} from './types';
import {ComparisonLoader} from './comparison-loader';
import {buildSlipComparison} from './comparison';

const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'};
let db:PostgresDatabaseClient|null=null;
async function read(ids:readonly string[],locale:SiteLocale){
  const url=databaseUrl();if(!url)throw new Error('COMPARISON_DATABASE_UNAVAILABLE');
  db??=new PostgresDatabaseClient(url);return readSlipComparison(db,ids,locale);
}
const loader=new ComparisonLoader(read,Date.now,event=>console.info(`[LivaSports M7] ${JSON.stringify({event:'slip-comparison',...event})}`));
async function input(request:Request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return {error:403} as const;
  if(url.search||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return {error:400} as const;
  try{const value=parseResolutionRequest(await boundedJson(request));return value?{value}:{error:400} as const;}
  catch(error){return {error:error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400} as const;}
}
export async function compareSlipRequest(request:Request,service:Pick<ComparisonLoader,'resolve'>=loader):Promise<Response>{
  const parsed=await input(request);
  if('error' in parsed)return Response.json({error:'INVALID_SLIP',providerRequests:0},{status:parsed.error,headers});
  try{return Response.json(await service.resolve(parsed.value.selections,parsed.value.locale),{headers});}
  catch{return Response.json({error:'COMPARISON_TEMPORARILY_UNAVAILABLE',providerRequests:0},{status:503,headers});}
}
export async function currentSlipDestination(bookmaker:string,selections:CanonicalSelection[],locale:SiteLocale,
  reader:(ids:readonly string[],locale:SiteLocale)=>Promise<SlipComparisonRead>=read):Promise<string|null>{
  if(!['betsson','betano.bet.br'].includes(bookmaker)||!selections.length||!parseResolutionRequest({selections,locale}))return null;
  // Always bypass the comparison cache. All exact selections are checked again on click.
  const data=await reader(selections.map(s=>s.fixturePublicId),locale);
  const result=buildSlipComparison(selections,locale,data.fixtures,data.bookmakers).bookmakers.find(b=>b.bookmakerId===bookmaker);
  return result?.complete&&result.ctaState==='ENABLED'?data.destinations[bookmaker]??null:null;
}
// Compatibility export; all actual redirect responses use the M8 boundary.
export {legacySlipRequest as slipOutboundRequest} from '@/affiliate/server';
