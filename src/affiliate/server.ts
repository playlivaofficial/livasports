import 'server-only';
import {after} from 'next/server';
import {boundedJson} from '@/slip/server';
import {parseResolutionRequest} from '@/slip/types';
import {analyticsAllowed,campaignDestination,geoAllowed,isSlipPlacement,parseContext,trafficClass} from './policy';
import {signingKey,verifyOffer} from './tokens';
import {publicOffer,resolveOffer,type OfferDependencies} from './service';
import {affiliateDatabase,runtimeDependencies} from './runtime';
import {recordClick,recordImpression,recordOperationalError} from './analytics';
import {uuid,type CommercialContext,type TrafficClass,type VerifiedOffer} from './types';
export const commercialHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
type Deferred=(work:()=>Promise<void>)=>void;
export interface CommercialServices {deps:OfferDependencies;key:string|null;geo:(request:Request,locale:'br'|'mx')=>boolean;defer:Deferred;
  click:(offer:VerifiedOffer,view:string,traffic:TrafficClass,key:string)=>Promise<unknown>;impression:(offer:VerifiedOffer,view:string,traffic:TrafficClass)=>Promise<unknown>;}
function services():CommercialServices{return {deps:runtimeDependencies(),key:signingKey(),geo:geoAllowed,defer:after,
  click:(o,v,t,k)=>recordClick(affiliateDatabase(),o,v,t,k),impression:(o,v,t)=>recordImpression(affiliateDatabase(),o,v,t)};}
const response=(status:number)=>new Response(null,{status,headers:commercialHeaders});
const decline=(request:Request,context:CommercialContext)=>isSlipPlacement(context.placement)?new Response(null,{status:303,headers:{...commercialHeaders,Location:new URL(`/${context.locale}?slip=unavailable`,request.url).href}}):response(404);
function sameOrigin(r:Request){const origin=r.headers.get('origin');return !origin||origin===new URL(r.url).origin;}
function configurationFailure(provided?:CommercialServices){if(provided)return;try{after(async()=>{try{await recordOperationalError(affiliateDatabase(),'CONFIG_READ_FAILED');}catch{/* No private diagnostics. */}});}catch{/* Outside a request, logging is unavailable. */}}
function deferred(s:CommercialServices,work:()=>Promise<unknown>){
  try{s.defer(async()=>{try{await work();}catch{console.warn('[LivaSports M8] {"event":"attribution-write-failed","providerRequests":0}');try{await recordOperationalError(affiliateDatabase(),'ATTRIBUTION_WRITE_FAILED');}catch{/* Optional reporting never leaks details. */}}});}catch{/* Failure to schedule telemetry never blocks a verified redirect. */}
}
export async function offersRequest(request:Request,provided?:CommercialServices):Promise<Response>{
  if(!sameOrigin(request))return response(403);if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0]!=='application/json')return response(400);
  let input:unknown;try{input=await boundedJson(request,16384);}catch{return response(400);}
  if(!Array.isArray(input)||input.length<1||input.length>16)return response(400);const contexts=input.map(parseContext);if(contexts.some(c=>!c))return response(400);
  try{const s=provided??services();if(!s.key)return Response.json({offers:contexts.map(()=>null),providerRequests:0},{headers:commercialHeaders});
    // One campaign read and one page read per unique context page in the batch.
    const campaigns=new Map<string,ReturnType<OfferDependencies['campaigns']>>(),pages=new Map<string,ReturnType<OfferDependencies['page']>>();
    const deps:OfferDependencies={...s.deps,campaigns:locale=>{if(!campaigns.has(locale))campaigns.set(locale,s.deps.campaigns(locale));return campaigns.get(locale)!;},
      page:context=>{const id=context.pagePath+':'+(context.competitionSlug??'');if(!pages.has(id))pages.set(id,s.deps.page(context));return pages.get(id)!;}};
    const offers=[];for(const context of contexts){if(!context||!s.geo(request,context.locale)){offers.push(null);continue;}const offer=await resolveOffer(context,deps);offers.push(offer?publicOffer(offer,s.key):null);}
    return Response.json({offers,providerRequests:0},{headers:commercialHeaders});
  }catch{console.warn('[LivaSports M8] {"event":"offer-config-unavailable","providerRequests":0}');return Response.json({offers:contexts.map(()=>null),providerRequests:0},{headers:commercialHeaders});}
}
export async function outboundRequest(request:Request,bookmaker:string,placement:string,provided?:CommercialServices):Promise<Response>{
  if(request.method==='HEAD')return response(204);if(request.method!=='GET')return response(405);
  const url=new URL(request.url);if(url.href.length>8192||!sameOrigin(request)||!['betsson','betano.bet.br'].includes(bookmaker))return response(400);
  const keys=[...url.searchParams.keys()];if(keys.some(k=>!['offer','qa'].includes(k)||url.searchParams.getAll(k).length!==1)||url.searchParams.has('qa')&&url.searchParams.get('qa')!=='1')return response(400);
  if(request.headers.get('purpose')||request.headers.get('sec-purpose')||request.headers.get('next-router-prefetch')||/bot|crawler|spider/i.test(request.headers.get('user-agent')??''))return response(204);
  try{const s=provided??services();if(!s.key)return response(404);const token=verifyOffer(url.searchParams.get('offer'),s.key,Date.now(),true);
    if(!token||token.context.bookmaker!==bookmaker||token.context.placement!==placement)return response(400);
    if(token.expiresAt<=Date.now()||!s.geo(request,token.context.locale))return decline(request,token.context);
    const offer=await resolveOffer(token.context,s.deps,Date.now(),token.campaignId);if(!offer)return decline(request,token.context);
    const destination=campaignDestination(offer.campaign,offer.context,Date.now());if(!destination)return response(404);
    const traffic=trafficClass(request,true,url.searchParams.get('qa')==='1');
    if(analyticsAllowed(request)&&traffic!=='UNKNOWN')deferred(s,()=>s.click(offer,token.viewId,traffic,s.key!));
    console.info(`[LivaSports M8] ${JSON.stringify({event:'redirect-issued',placement,locale:token.context.locale,bookmaker,traffic,providerRequests:0})}`);
    return new Response(null,{status:303,headers:{...commercialHeaders,Location:destination}});
  }catch{console.warn('[LivaSports M8] {"event":"redirect-config-failed","providerRequests":0}');configurationFailure(provided);return response(503);}
}
export async function impressionRequest(request:Request,body:Record<string,unknown>,provided?:CommercialServices):Promise<Response>{
  if(!sameOrigin(request))return response(403);
  if(Object.keys(body).some(k=>!['eventId','eventName','offer','qa'].includes(k))||!uuid.test(String(body.eventId))||body.eventName!=='affiliate_impression'||body.qa!==undefined&&body.qa!==true)return response(400);
  if(!analyticsAllowed(request))return response(204);
  try{const s=provided??services();if(!s.key)return response(204);const token=verifyOffer(body.offer,s.key);if(!token)return response(400);
    if(!s.geo(request,token.context.locale))return response(204);
    // A signed rendered offer is still revalidated; stale/disabled/off-GEO never counts.
    const offer=await resolveOffer(token.context,s.deps,Date.now(),token.campaignId);if(!offer)return response(204);
    if(request.headers.get('purpose')||request.headers.get('sec-purpose')||/bot|crawler|spider/i.test(request.headers.get('user-agent')??''))return response(204);
    const traffic=body.qa||request.headers.get('x-livasports-qa')==='1'?'QA_TEST':request.headers.get('sec-fetch-site')==='same-origin'?'HUMAN_VIEW':'UNKNOWN';
    if(traffic!=='UNKNOWN')deferred(s,()=>s.impression(offer,token.viewId,traffic));return response(204);
  }catch{return response(204);}
}
// Legacy links retain safe navigation but have no signed render/activation proof,
// so they never contribute to the attributable human-click funnel.
export async function legacyOutbound(request:Request,context:CommercialContext,provided?:CommercialServices):Promise<Response>{
  if(request.method==='HEAD')return response(204);
  if(!parseContext(context)||!sameOrigin(request))return response(400);
  if(request.headers.get('purpose')||request.headers.get('sec-purpose')||/bot|crawler|spider/i.test(request.headers.get('user-agent')??''))return response(204);
  try{const s=provided??services();if(!s.geo(request,context.locale))return decline(request,context);
    const offer=await resolveOffer(context,s.deps);const destination=offer?campaignDestination(offer.campaign,offer.context,Date.now()):null;
    return destination?new Response(null,{status:303,headers:{...commercialHeaders,Location:destination}}):decline(request,context);
  }catch{return decline(request,context);}
}
export async function legacySlipRequest(request:Request,bookmaker:string,provided?:CommercialServices):Promise<Response>{
  const url=new URL(request.url);let selections;try{selections=JSON.parse(url.searchParams.get('selections')??'null');}catch{selections=null;}
  const parsed=parseResolutionRequest({locale:url.searchParams.get('locale'),selections});
  if(url.href.length>4096||!parsed||!['betsson','betano.bet.br'].includes(bookmaker)||[...url.searchParams.keys()].some(k=>!['locale','selections'].includes(k)||url.searchParams.getAll(k).length!==1))return response(400);
  return legacyOutbound(request,{...parsed,bookmaker:bookmaker as 'betsson'|'betano.bet.br',pagePath:`/${parsed.locale}`,placement:'slip_bookmaker_comparison'},provided);
}
