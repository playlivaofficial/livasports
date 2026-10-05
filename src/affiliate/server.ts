import 'server-only';
import {ownerPreview,previewBinding} from '@/owner/session';
import {qaCreativeDocument} from '@/owner/creative';
import type {OfferToken} from './types';
import {after} from 'next/server';
import {boundedJson} from '@/slip/server';
import {parseResolutionRequest} from '@/slip/types';
import {recordServerEvent} from '@/analytics/server';
import {analyticsAllowed,campaignDestination,geoAllowed,isOddsCtaPlacement,isSlipPlacement,parseContext,trafficClass} from './policy';
import {requestCommercialGeo,commercialLocale} from '@/odds/commercial-geo';
import {signingKey,verifyOffer} from './tokens';
import {publicOffer,resolveOffer,type OfferDependencies} from './service';
import {affiliateDatabase,runtimeDependencies} from './runtime';
import {recordClick,recordImpression,recordOperationalError} from './analytics';
import {uuid,type CommercialContext,type TrafficClass,type VerifiedOffer} from './types';
import {embedDocument} from './embed-document';
import {safeBetssonEmbed} from './embed-policy';
import {isVisibleBookmaker} from '@/odds/registry';
import {deviceClass,revenueContext} from './attribution';
export const commercialHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie'};
type Deferred=(work:()=>Promise<void>)=>void;
export interface CommercialServices {deps:OfferDependencies;key:string|null;geo:(request:Request,locale:CommercialContext['locale'])=>boolean;defer:Deferred;
  click:(offer:VerifiedOffer,view:string,traffic:TrafficClass,key:string,activation?:'ISSUED_303'|'EMBED_ACTIVATION')=>Promise<unknown>;impression:(offer:VerifiedOffer,view:string,traffic:TrafficClass)=>Promise<unknown>;}
function services():CommercialServices{return {deps:runtimeDependencies(),key:signingKey(),geo:geoAllowed,defer:after,
  click:(o,v,t,k,a)=>recordClick(affiliateDatabase(),o,v,t,k,Date.now(),a),impression:(o,v,t)=>recordImpression(affiliateDatabase(),o,v,t)};}
const response=(status:number)=>new Response(null,{status,headers:commercialHeaders});
const decline=(request:Request,context:CommercialContext)=>isSlipPlacement(context.placement)?new Response(null,{status:303,headers:{...commercialHeaders,Location:new URL(`/${context.locale}?slip=unavailable`,request.url).href}}):response(404);
function tokenAllowed(request:Request,token:OfferToken,s:CommercialServices){return (!token.qaSession||token.qaSession===previewBinding(request.headers))&&s.geo(request,token.context.locale);}
function qaRequest(request:Request,token?:OfferToken){return !!token?.qaSession||!!ownerPreview(request.headers);}
const qaDestination=(request:Request)=>new URL('/owner/preview/click',request.url).href;
function sameOrigin(r:Request){const origin=r.headers.get('origin');return !origin||origin===new URL(r.url).origin;}
function configurationFailure(provided?:CommercialServices){if(provided)return;try{after(async()=>{try{await recordOperationalError(affiliateDatabase(),'CONFIG_READ_FAILED');}catch{/* No private diagnostics. */}});}catch{/* Outside a request, logging is unavailable. */}}
function deferred(s:CommercialServices,work:()=>Promise<unknown>){
  try{s.defer(async()=>{try{await work();}catch{console.warn('[LivaSports M8] {"event":"attribution-write-failed","providerRequests":0}');try{await recordOperationalError(affiliateDatabase(),'ATTRIBUTION_WRITE_FAILED');}catch{/* Optional reporting never leaks details. */}}});}catch{/* Failure to schedule telemetry never blocks a verified redirect. */}
}
async function recordOutcome(request:Request,offer:VerifiedOffer,clickId:unknown,traffic:TrafficClass,embed=false){
  if(typeof clickId!=='string'||!uuid.test(clickId))return;
  const {context,page,campaign}=offer;
  await recordServerEvent({name:embed?'affiliate_embed_activated':'outbound_redirect_completed',eventId:clickId,headers:request.headers,
    locale:context.locale,canonicalPath:context.pagePath,bookmaker:campaign.bookmaker,placement:context.placement,campaignId:campaign.id,
    fixtureId:page.fixtureId,competitionId:page.competitionId,teamId:page.teamId,
    market:context.market,slipLegCount:context.selections?.length??(context.market?1:undefined),trafficClass:traffic==='QA_TEST'?'QA':'HUMAN',
    props:{...revenueContext(context),deviceClass:deviceClass(request.headers),activation:embed?'EMBED_ACTIVATION':'ISSUED_303',
      ...(context.selections?{selectionFixtures:[...new Set(context.selections.map(s=>s.fixturePublicId))].join(','),
        selectionMarkets:[...new Set(context.selections.map(s=>s.market))].join(',')}:{}),
    }});
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
    const offers=[];for(const context of contexts){
      if(!context){offers.push(null);continue;}
      const commercial=isOddsCtaPlacement(context.placement)?commercialLocale(requestCommercialGeo(request.headers)):null;
      const resolved=commercial&&isOddsCtaPlacement(context.placement)?{...context,locale:commercial}:context;
      if(isOddsCtaPlacement(context.placement)?!commercial:!s.geo(request,context.locale)){offers.push(null);continue;}
      const offer=await resolveOffer(resolved,deps);
      if(offer?.creative?.delivery==='BETSSON_EMBED'&&!analyticsAllowed(request)){offers.push(null);continue;}
      offers.push(offer?publicOffer(offer,s.key,Date.now(),process.env.AFFILIATE_ANALYTICS_MODE==='consent'?'consent':'anonymous',previewBinding(request.headers)):null);}
    return Response.json({offers,providerRequests:0},{headers:commercialHeaders});
  }catch{console.warn('[LivaSports M8] {"event":"offer-config-unavailable","providerRequests":0}');return Response.json({offers:contexts.map(()=>null),providerRequests:0},{headers:commercialHeaders});}
}
export async function creativeRequest(request:Request,provided?:CommercialServices):Promise<Response>{
  if(request.method==='HEAD')return response(204);if(request.method!=='GET')return response(405);
  if(request.headers.get('sec-fetch-dest')!=='iframe'||request.headers.get('sec-fetch-site')!=='same-origin')return response(404);
  const q=new URL(request.url).searchParams;
  if([...q.keys()].length!==1||q.getAll('offer').length!==1||request.headers.get('purpose')||request.headers.get('sec-purpose'))return response(400);
  const mode=process.env.AFFILIATE_ANALYTICS_MODE??'anonymous';
  // Consent was checked when the signed embed grant was issued. Credentialless
  // frame requests carry no first-party cookie, so require that signed grant.
  if(!analyticsAllowed(request,mode==='consent'?'anonymous':mode))return response(404);
  try{const s=provided??services();if(!s.key)return response(404);const token=verifyOffer(q.get('offer'),s.key);
    if(!token?.embedPermission||mode==='consent'&&token.embedPermission!=='consent'||!tokenAllowed(request,token,s))return response(404);
    const offer=await resolveOffer(token.context,s.deps,Date.now(),token.campaignId,token.campaignVersion),c=offer?.creative;
    if(!offer||c?.delivery!=='BETSSON_EMBED'||!safeBetssonEmbed(c.embedSourceUrl,offer.campaign.operatorCampaignId,offer.campaign.bookmaker,offer.campaign.locale))return response(404);
    if(qaRequest(request,token))return await qaCreativeDocument(c,offer.campaign.operatorCampaignId,new URL(request.url).origin,q.get('offer')!.slice(-43),offer.campaign.bookmaker);
    return embedDocument(c,new URL(request.url).origin,q.get('offer')!.slice(-43));
  }catch{return response(404);}
}
export async function embedClickRequest(request:Request,body:Record<string,unknown>,provided?:CommercialServices):Promise<Response>{
  if(!sameOrigin(request)||request.headers.get('sec-fetch-site')!=='same-origin')return response(403);
  if(Object.keys(body).some(k=>!['eventId','eventName','offer','qa'].includes(k))||!uuid.test(String(body.eventId))||body.eventName!=='affiliate_embed_click'||body.qa!==undefined&&body.qa!==true)return response(400);
  if(!analyticsAllowed(request)||request.headers.get('purpose')||request.headers.get('sec-purpose')||/bot|crawler|spider/i.test(request.headers.get('user-agent')??''))return response(204);
  try{const s=provided??services();if(!s.key)return response(204);const token=verifyOffer(body.offer,s.key);
    if(!token?.embedPermission)return response(400);if(!tokenAllowed(request,token,s))return response(204);
    // Owner-preview Betsson creatives navigate through the signed outbound route.
    // That route alone records the click, including for an older mounted creative.
    if(token.context.bookmaker==='betsson'&&qaRequest(request,token))return response(204);
    const offer=await resolveOffer(token.context,s.deps,Date.now(),token.campaignId,token.campaignVersion);if(offer?.creative?.delivery!=='BETSSON_EMBED')return response(204);
    const traffic=qaRequest(request,token)||body.qa||request.headers.get('x-livasports-qa')==='1'?'QA_TEST':'HUMAN_CLICK';
    deferred(s,async()=>{const clickId=await s.click(offer,token.viewId,traffic,s.key!,'EMBED_ACTIVATION');await recordOutcome(request,offer,clickId,traffic,true);});
    return response(204);
  }catch{return response(204);}
}
export async function outboundRequest(request:Request,bookmaker:string,placement:string,provided?:CommercialServices):Promise<Response>{
  if(request.method==='HEAD')return response(204);if(request.method!=='GET')return response(405);
  // Any public card may be linked. The real gate is downstream: the signed token must match, the
  // campaign must resolve, and safeAffiliateDestination must accept the host. Naming operators here
  // silently 400'd every card added after Betsson.
  const url=new URL(request.url);if(url.href.length>8192||!sameOrigin(request)||!isVisibleBookmaker(bookmaker))return response(400);
  const keys=[...url.searchParams.keys()];if(keys.some(k=>!['offer','qa'].includes(k)||url.searchParams.getAll(k).length!==1)||url.searchParams.has('qa')&&url.searchParams.get('qa')!=='1')return response(400);
  if(request.headers.get('purpose')||request.headers.get('sec-purpose')||request.headers.get('next-router-prefetch')||/bot|crawler|spider/i.test(request.headers.get('user-agent')??''))return response(204);
  try{const s=provided??services();if(!s.key)return response(404);const token=verifyOffer(url.searchParams.get('offer'),s.key,Date.now(),true);
    if(!token||token.context.bookmaker!==bookmaker||token.context.placement!==placement)return response(400);
    if(token.expiresAt<=Date.now()||!tokenAllowed(request,token,s))return decline(request,token.context);
    const offer=await resolveOffer(token.context,s.deps,Date.now(),token.campaignId,token.campaignVersion);if(!offer)return decline(request,token.context);
    const destination=campaignDestination(offer.campaign,offer.context,Date.now());if(!destination)return response(404);
    const traffic=trafficClass(request,true,qaRequest(request,token)||url.searchParams.get('qa')==='1');
    // One deferred task: the click ledger (commercial source of truth) followed by the P4 server-authoritative funnel event. Both honour DNT/GPC.
    if(analyticsAllowed(request)&&traffic!=='UNKNOWN')deferred(s,async()=>{const clickId=await s.click(offer,token.viewId,traffic,s.key!);
      // A replay rejected by the click ledger is not a second funnel outcome. The shared UUID makes reconciliation exact.
      await recordOutcome(request,offer,clickId,traffic);});
    console.info(`[LivaSports M8] ${JSON.stringify({event:'redirect-issued',placement,locale:token.context.locale,bookmaker,traffic,providerRequests:0})}`);
    // Owner QA reaches the real operator so the partner link can be verified end to end; the click is
    // still classified QA_TEST above, so human attribution is untouched. Only a campaign without
    // commercial approval is parked on the internal QA page — previously every book except Betsson
    // was, which made an approved 1xBet CTA look broken to the owner.
    return new Response(null,{status:303,headers:{...commercialHeaders,Location:qaRequest(request,token)&&!offer.campaign.affiliateApproved?qaDestination(request):destination}});
  }catch{console.warn('[LivaSports M8] {"event":"redirect-config-failed","providerRequests":0}');configurationFailure(provided);return response(503);}
}
export async function impressionRequest(request:Request,body:Record<string,unknown>,provided?:CommercialServices):Promise<Response>{
  if(!sameOrigin(request))return response(403);
  if(Object.keys(body).some(k=>!['eventId','eventName','offer','qa'].includes(k))||!uuid.test(String(body.eventId))||body.eventName!=='affiliate_impression'||body.qa!==undefined&&body.qa!==true)return response(400);
  if(!analyticsAllowed(request))return response(204);
  try{const s=provided??services();if(!s.key)return response(204);const token=verifyOffer(body.offer,s.key);if(!token)return response(400);
    if(!tokenAllowed(request,token,s))return response(204);
    // A signed rendered offer is still revalidated; stale/disabled/off-GEO never counts.
    const offer=await resolveOffer(token.context,s.deps,Date.now(),token.campaignId,token.campaignVersion);if(!offer)return response(204);
    if(request.headers.get('purpose')||request.headers.get('sec-purpose')||/bot|crawler|spider/i.test(request.headers.get('user-agent')??''))return response(204);
    const traffic=qaRequest(request,token)||body.qa||request.headers.get('x-livasports-qa')==='1'?'QA_TEST':request.headers.get('sec-fetch-site')==='same-origin'?'HUMAN_VIEW':'UNKNOWN';
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
    // Unsigned legacy links carry no render/activation proof, so an owner preview stays first-party
    // here even for an approved campaign. Only the signed offer path completes outbound under QA.
    return destination?new Response(null,{status:303,headers:{...commercialHeaders,Location:qaRequest(request)?qaDestination(request):destination}}):decline(request,context);
  }catch{return decline(request,context);}
}
export async function legacySlipRequest(request:Request,bookmaker:string,provided?:CommercialServices):Promise<Response>{
  const url=new URL(request.url);let selections;try{selections=JSON.parse(url.searchParams.get('selections')??'null');}catch{selections=null;}
  const parsed=parseResolutionRequest({locale:url.searchParams.get('locale'),selections});
  if(url.href.length>4096||!parsed||!isVisibleBookmaker(bookmaker)||[...url.searchParams.keys()].some(k=>!['locale','selections'].includes(k)||url.searchParams.getAll(k).length!==1))return response(400);
  return legacyOutbound(request,{...parsed,bookmaker:bookmaker as CommercialContext['bookmaker'],pagePath:`/${parsed.locale}`,placement:'slip_bookmaker_comparison'},provided);
}
