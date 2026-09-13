import {parseResolutionRequest} from '@/slip/types';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {embedDimensions,safeBetssonEmbed} from './embed-policy';
import {placements,type Campaign,type CommercialContext,type Creative,type PageType,type TrafficClass} from './types';

export function pageType(path:string):PageType|null {
  if(/^\/(br|mx)(\/(futebol|futbol|ao-vivo|en-vivo|jogos\/hoje|partidos\/hoy))?$/.test(path))return 'HOME';
  if(/^\/br\/jogo\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/mx\/partido\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path))return 'MATCH';
  if(/^\/br\/time\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/mx\/equipo\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path))return 'TEAM';
  if(/^\/br\/jogador\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path)||/^\/mx\/jugador\/[a-z0-9-]+-[a-f0-9]{16}$/.test(path))return 'PLAYER';
  if(/^\/(br|mx)\/(competicoes|competiciones)\/[a-z0-9-]+$/.test(path))return 'COMPETITION';
  return null;
}
export function isSlipPlacement(p:string){return p==='slip_bookmaker_comparison'||p==='match_slip_comparison';}
export function isSponsorPlacement(p:string){return !isSlipPlacement(p)&&p!=='match_odds_table';}
export function parseContext(value:unknown):CommercialContext|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['locale','pagePath','placement','bookmaker','fixturePublicId','market','selections','competitionSlug'].includes(k))||
    (v.locale!=='br'&&v.locale!=='mx')||typeof v.pagePath!=='string'||v.pagePath.length>240||!v.pagePath.startsWith('/'+v.locale)||
    !placements.includes(v.placement as never)||(v.bookmaker!==undefined&&!['betsson','betano.bet.br'].includes(String(v.bookmaker))))return null;
  const type=pageType(v.pagePath),placement=String(v.placement);if(!type)return null;
  if(placement==='competition_inline'?(typeof v.competitionSlug!=='string'||!/^[-a-z0-9]{1,100}$/.test(v.competitionSlug)):v.competitionSlug!==undefined)return null;
  if(placement.startsWith('match_')&&type!=='MATCH'||placement.startsWith('team_')&&type!=='TEAM'||placement.startsWith('player_')&&type!=='PLAYER'||
    placement.startsWith('home_')&&type!=='HOME'||placement==='competition_inline'&&type!=='HOME'||placement==='profile_mobile_inline'&&!['TEAM','PLAYER'].includes(type))return null;
  if(isSlipPlacement(placement)){
    const parsed=parseResolutionRequest({locale:v.locale,selections:v.selections});if(!v.bookmaker||!parsed?.selections.length||v.market!==undefined||v.fixturePublicId!==undefined)return null;
  }else if(placement==='match_odds_table'){
    if(!v.bookmaker||typeof v.fixturePublicId!=='string'||!/^[a-f0-9]{16}$/.test(v.fixturePublicId)||!v.pagePath.endsWith('-'+v.fixturePublicId)||
      !['MATCH_WINNER','TOTAL_GOALS','BTTS'].includes(String(v.market))||v.selections!==undefined)return null;
  }else if(v.fixturePublicId!==undefined||v.market!==undefined||v.selections!==undefined)return null;
  return v as unknown as CommercialContext;
}
export function campaignDestination(c:Campaign,context:CommercialContext,now:number):string|null {
  if(!c.enabled||!c.approved||!c.affiliateApproved||!c.geoEligible||c.locale!==context.locale||context.bookmaker&&c.bookmaker!==context.bookmaker||
    c.bookmaker==='betano.bet.br'&&context.locale!=='br'||!c.placements.includes(context.placement)||
    !['HOMEPAGE','SPORTSBOOK'].includes(c.destinationType)||!Number.isFinite(Date.parse(c.startsAt))||!Number.isFinite(Date.parse(c.endsAt))||
    now<Date.parse(c.startsAt)||now>=Date.parse(c.endsAt)||!c.operatorCampaignId.trim())return null;
  const destination=safeAffiliateDestination(c.bookmaker,c.locale,c.destination);if(!destination)return null;
  return c.domains.includes(new URL(destination).hostname)?destination:null;
}
export function validCreative(c:Creative,context:CommercialContext,now:number,campaignId?:string){
  return c.enabled&&c.approved&&c.placement===context.placement&&c.locale===context.locale&&
    (!c.startsAt||Number.isFinite(Date.parse(c.startsAt))&&now>=Date.parse(c.startsAt))&&(!c.endsAt||Number.isFinite(Date.parse(c.endsAt))&&now<Date.parse(c.endsAt))&&
    (c.delivery==='BETSSON_EMBED'?c.locale==='br'&&c.imageUrl===null&&embedDimensions(c.placement,c.width,c.height)&&!!campaignId&&!!safeBetssonEmbed(c.embedSourceUrl,campaignId):
      (!c.delivery||c.delivery==='IMAGE')&&!c.embedSourceUrl&&typeof c.imageUrl==='string'&&/^\/sponsors\/[a-zA-Z0-9/_-]+\.(png|webp|jpg|jpeg|avif)$/.test(c.imageUrl))&&c.imageAlt.trim().length>0&&c.imageAlt.length<=300&&
    Number.isInteger(c.width)&&c.width>=100&&c.width<=2400&&Number.isInteger(c.height)&&c.height>=40&&c.height<=1600;
}
export function geoAllowed(request:Request,locale:'br'|'mx',env:Readonly<Record<string,string|undefined>>=process.env){
  const country=env.VERCEL==='1'?request.headers.get('x-vercel-ip-country'):env.AFFILIATE_QA_GEO;
  return country===locale.toUpperCase();
}
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
