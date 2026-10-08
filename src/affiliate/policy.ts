import {parseResolutionRequest} from '@/slip/types';
import {requestCommercialGeo} from '@/odds/commercial-geo';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {embedDimensions,embedTrackingHost,safePublisherEmbed,oneXBetMediaId,ONE_XBET_PE_CREATIVES} from './embed-policy';
import {isPublisherEmbed,placements,type Campaign,type CommercialContext,type Creative,type PageType,type TrafficClass} from './types';
import {isVisibleBookmaker,bookmakerConfig} from '@/odds/registry';
import type {SiteLocale} from '@/config/i18n';

export function pageType(path:string):PageType|null {
  if(/^\/(br|mx|co|pe)(\/(futebol|futbol|ao-vivo|en-vivo|jogos\/hoje|partidos\/hoy))?$/.test(path))return 'HOME';
  if(/^\/br\/jogo\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/(mx|co|pe)\/partido\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/en\/match\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path))return 'MATCH';
  if(/^\/br\/time\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/(mx|co|pe)\/equipo\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path))return 'TEAM';
  if(/^\/br\/jogador\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/(mx|co|pe)\/jugador\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path))return 'PLAYER';
  if(/^\/(br|mx|co|pe)\/(competicoes|competiciones)\/[a-z0-9-]+$/.test(path))return 'COMPETITION';
  return null;
}
export function isSlipPlacement(p:string){return p==='slip_bookmaker_comparison'||p==='match_slip_comparison';}
export function isSponsorPlacement(p:string){return !isSlipPlacement(p)&&p!=='match_odds_table';}
export function parseContext(value:unknown):CommercialContext|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['locale','pagePath','placement','bookmaker','fixturePublicId','market','selections','competitionSlug','slipId'].includes(k))||
    !['br','mx','co','pe'].includes(String(v.locale))||typeof v.pagePath!=='string'||v.pagePath.length>240||
    !placements.includes(v.placement as never)||(v.bookmaker!==undefined&&!isVisibleBookmaker(String(v.bookmaker))))return null;
  const type=pageType(v.pagePath),placement=String(v.placement);if(!type)return null;
  const pathOk=v.pagePath.startsWith('/'+v.locale)||(placement==='match_odds_table'&&/^\/en\/match\/[a-z0-9-]+-[a-f0-9]{16}$/.test(v.pagePath));
  if(!pathOk)return null;
  if(placement==='competition_inline'?(typeof v.competitionSlug!=='string'||!/^[-a-z0-9]{1,100}$/.test(v.competitionSlug)):v.competitionSlug!==undefined)return null;
  if(placement.startsWith('match_')&&type!=='MATCH'||placement.startsWith('team_')&&type!=='TEAM'||placement.startsWith('player_')&&type!=='PLAYER'||
    placement.startsWith('home_')&&type!=='HOME'||placement==='competition_inline'&&type!=='HOME'||placement==='profile_mobile_inline'&&!['TEAM','PLAYER'].includes(type))return null;
  if(isSlipPlacement(placement)){
    const parsed=parseResolutionRequest({locale:v.locale,selections:v.selections});if(!v.bookmaker||!parsed?.selections.length||v.market!==undefined||v.fixturePublicId!==undefined)return null;
    if(v.slipId!==undefined&&(typeof v.slipId!=='string'||!/^[0-9a-f]{32}$/.test(v.slipId)))return null;
  }else if(placement==='match_odds_table'){
    if(!v.bookmaker||typeof v.fixturePublicId!=='string'||!/^[a-f0-9]{16}$/.test(v.fixturePublicId)||!v.pagePath.endsWith('-'+v.fixturePublicId)||
      !['MATCH_WINNER','TOTAL_GOALS','BTTS'].includes(String(v.market))||v.selections!==undefined||v.slipId!==undefined)return null;
  }else if(v.fixturePublicId!==undefined||v.market!==undefined||v.selections!==undefined||v.slipId!==undefined)return null;
  return v as unknown as CommercialContext;
}
export function campaignDestination(c:Campaign,context:CommercialContext,now:number):string|null {
  if(!isVisibleBookmaker(c.bookmaker)||!c.operatorDomains&&!bookmakerConfig(c.bookmaker)?.countries.some(country=>country===context.locale.toUpperCase()))return null;
  if(!c.enabled||!c.approved||!c.affiliateApproved||!c.geoEligible||c.locale!==context.locale||context.bookmaker&&c.bookmaker!==context.bookmaker||
    c.bookmaker==='betano.bet.br'&&context.locale!=='br'||!c.placements.includes(context.placement)||
    !['HOMEPAGE','SPORTSBOOK'].includes(c.destinationType)||!Number.isFinite(Date.parse(c.startsAt))||!Number.isFinite(Date.parse(c.endsAt))||
    now<Date.parse(c.startsAt)||now>=Date.parse(c.endsAt)||!c.operatorCampaignId.trim())return null;
  const destination=safeAffiliateDestination(c.bookmaker,c.locale,c.destination,c.operatorDomains);if(!destination)return null;
  return c.domains.includes(new URL(destination).hostname)?destination:null;
}
export function validCreative(c:Creative,context:CommercialContext,now:number,campaignId?:string,operator?:string){
  const oneXBetSize=c.delivery==='ONE_XBET_IFRAME'?ONE_XBET_PE_CREATIVES[oneXBetMediaId(c.embedSourceUrl,operator??'',c.locale)??'']:null;
  return c.enabled&&c.approved&&c.placement===context.placement&&c.locale===context.locale&&
    (c.delivery!=='ONE_XBET_IFRAME'||!!oneXBetSize&&c.width===oneXBetSize.width&&c.height===oneXBetSize.height)&&
    (!c.startsAt||Number.isFinite(Date.parse(c.startsAt))&&now>=Date.parse(c.startsAt))&&(!c.endsAt||Number.isFinite(Date.parse(c.endsAt))&&now<Date.parse(c.endsAt))&&
    // A publisher embed must satisfy its own delivery contract, which is what keeps an operator that
    // has neither a tracking host nor an approved partner iframe — bwin Colombia — from serving one.
    // A Bannerflow embed additionally needs the operator/GEO tracking host; the 1xBet Peru iframe is
    // bound to 1xBet in Peru, to 1xaff.pe/I, to our verified site id and to an approved
    // media id by safeOneXBetIframe, so it needs no redirect host of ours.
    (isPublisherEmbed(c.delivery)?!!operator&&(c.delivery!=='BETSSON_EMBED'||!!embedTrackingHost(operator,c.locale))&&c.imageUrl===null&&embedDimensions(c.placement,c.width,c.height,c.delivery)&&!!campaignId&&!!safePublisherEmbed(c.delivery,c.embedSourceUrl,campaignId,operator,c.locale):
      (!c.delivery||c.delivery==='IMAGE')&&!c.embedSourceUrl&&typeof c.imageUrl==='string'&&/^\/sponsors\/[a-zA-Z0-9/_-]+\.(png|webp|jpg|jpeg|avif)$/.test(c.imageUrl))&&c.imageAlt.trim().length>0&&c.imageAlt.length<=300&&
    Number.isInteger(c.width)&&c.width>=100&&c.width<=2400&&Number.isInteger(c.height)&&c.height>=40&&c.height<=1600;
}
export function geoAllowed(request:Request,locale:SiteLocale,env:Readonly<Record<string,string|undefined>>=process.env){
  const country=requestCommercialGeo(request.headers,env);
  return country===locale.toUpperCase();
}
export function isOddsCtaPlacement(p:string){return p==='match_odds_table'||isSlipPlacement(p);}
export function analyticsAllowed(request:Request,mode=process.env.AFFILIATE_ANALYTICS_MODE??'anonymous'){
  if(mode==='off'||request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1')return false;
  if(mode==='consent')return /(?:^|;\s*)livasports_analytics_consent=granted(?:;|$)/.test(request.headers.get('cookie')??'');
  return mode==='anonymous';
}
export function trafficClass(request:Request,hasToken:boolean,qa=false):TrafficClass {
  if(qa||request.headers.get('x-livasports-qa')==='1')return 'QA_TEST';
  if(request.method!=='GET'||!hasToken||request.headers.get('purpose')||request.headers.get('sec-purpose')||request.headers.get('next-router-prefetch')||
    /bot|crawler|spider|headless|lighthouse|playwright|puppeteer/i.test(request.headers.get('user-agent')??''))return 'UNKNOWN';
  return request.headers.get('sec-fetch-user')==='?1'&&request.headers.get('sec-fetch-mode')==='navigate'&&request.headers.get('sec-fetch-dest')==='document'?'HUMAN_CLICK':'UNKNOWN';
}
