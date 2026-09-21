/**
 * P4 product analytics — typed, versioned event taxonomy and page/referrer classification.
 * Isomorphic: no server or browser dependencies. First-party only; no third-party trackers.
 */
import {SOURCE_BOOKMAKER_IDS,type BookmakerId} from '@/odds/registry';
export const EVENT_VERSION=1 as const;
export const CLIENT_EVENTS=[
  // session / acquisition
  'session_started','returning_session_started','landing_viewed','page_viewed',
  // discovery
  'competition_viewed','team_viewed','player_viewed','match_viewed','search_used',
  // odds
  'odds_visible','odds_selected','bookmaker_comparison_viewed',
  // slip
  'slip_created','slip_leg_added','slip_leg_removed','slip_cleared','stake_changed','slip_opened',
  // affiliate (interaction visibility; the redirect itself is server-authoritative)
  'affiliate_cta_viewed','affiliate_cta_clicked','bookmaker_logo_viewed','bookmaker_logo_clicked',
  // auth (start only; completion is server-authoritative)
  'sign_in_started',
  // personalization views
  'my_matches_viewed',
] as const;
/** Authoritative outcomes: recorded by the server only. A client batch naming one of these is rejected. */
export const SERVER_EVENTS=['outbound_redirect_completed','sign_in_completed','sign_out_completed','favorite_added','favorite_removed'] as const;
export const EVENT_NAMES=[...CLIENT_EVENTS,...SERVER_EVENTS] as const;
export type ClientEventName=typeof CLIENT_EVENTS[number];
export type ServerEventName=typeof SERVER_EVENTS[number];
export type EventName=typeof EVENT_NAMES[number];
export const isClientEvent=(v:unknown):v is ClientEventName=>(CLIENT_EVENTS as readonly string[]).includes(String(v));
export const isServerEvent=(v:unknown):v is ServerEventName=>(SERVER_EVENTS as readonly string[]).includes(String(v));

export const PAGE_TYPES=['home','football','live','today','competition','match','team','player','my_matches','sign_in','account','help','legal','search','owner','other'] as const;
export type PageType=typeof PAGE_TYPES[number];
export const REFERRER_CLASSES=['google_organic','bing_organic','other_search','direct','social','referral','paid','internal','unknown'] as const;
export type ReferrerClass=typeof REFERRER_CLASSES[number];
export type TrafficClass='HUMAN'|'QA'|'OWNER'|'BOT';
export type Locale='br'|'mx'|'en';
export const SESSION_WINDOW_MINUTES=30;
export const MAX_BATCH_EVENTS=25;
export const MAX_EVENT_BYTES=2048;

export interface EventContext {
  locale:Locale;pageType:PageType;canonicalPath:string;referrerClass:ReferrerClass;
  utm:{source?:string;medium?:string;campaign?:string;content?:string;term?:string};
}
export interface EventEntities {
  competitionSlug?:string;fixturePublicId?:string;teamPublicId?:string;playerPublicId?:string;
  bookmaker?:BookmakerId;sourceBookmaker?:BookmakerId;market?:'MATCH_WINNER'|'TOTAL_GOALS'|'BTTS';outcome?:'HOME'|'DRAW'|'AWAY'|'OVER'|'UNDER'|'YES'|'NO';
  priceKind?:'REAL'|'PROXY';slipLegCount?:number;comparisonState?:'REAL_COMPLETE'|'ESTIMATED_COMPLETE'|'INCOMPLETE';campaignId?:string;placement?:string;
}
/** Wire format of one client event (batched under {v:1,batch:[...]}). */
export interface ClientEvent extends EventContext,EventEntities {
  eventId:string;eventName:ClientEventName;eventVersion:typeof EVENT_VERSION;occurredAt:string;sessionId:string;anonymousId:string;
  props?:Record<string,string|number|boolean|null>;
  /** Session-level first-touch attribution, sent with session_started / returning_session_started only. */
  session?:{landingPath:string;landingPageType:PageType;referrerHost?:string;visitorKind:'NEW'|'RETURNING'};
}

export const ID_PATTERN=/^[A-Za-z0-9_-]{16,64}$/;
export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_ID=/^[a-f0-9]{16}$/i;
const SLUG=/^[a-z0-9-]{2,64}$/;
const SECRET_LIKE=/(token|secret|password|cookie|authorization|apikey|api_key|magic|bearer)/i;
const EMAIL_LIKE=/[^\s@]+@[^\s@]+\.[^\s@]+/;
const clean=(v:unknown,max:number)=>{if(typeof v!=='string')return undefined;const s=v.trim().slice(0,max);return s&&!SECRET_LIKE.test(s)&&!EMAIL_LIKE.test(s)?s:undefined;};

/** Validate and sanitize one client event; returns null for anything outside the contract. */
export function parseClientEvent(raw:unknown):ClientEvent|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const e=raw as Record<string,unknown>;
  if(JSON.stringify(e).length>MAX_EVENT_BYTES)return null;
  if(!isClientEvent(e.eventName)||e.eventVersion!==EVENT_VERSION)return null;
  if(!UUID_PATTERN.test(String(e.eventId??''))||!ID_PATTERN.test(String(e.sessionId??''))||!ID_PATTERN.test(String(e.anonymousId??'')))return null;
  const occurred=Date.parse(String(e.occurredAt??''));if(!Number.isFinite(occurred))return null;
  if(!['br','mx','en'].includes(String(e.locale)))return null;
  if(!(PAGE_TYPES as readonly string[]).includes(String(e.pageType)))return null;
  if(!(REFERRER_CLASSES as readonly string[]).includes(String(e.referrerClass)))return null;
  const canonicalPath=clean(e.canonicalPath,240);if(!canonicalPath||!canonicalPath.startsWith('/'))return null;
  for(const key of Object.keys(e))if(SECRET_LIKE.test(key))return null;
  const utmRaw=e.utm&&typeof e.utm==='object'?e.utm as Record<string,unknown>:{};
  const utm={source:clean(utmRaw.source,80),medium:clean(utmRaw.medium,80),campaign:clean(utmRaw.campaign,120),content:clean(utmRaw.content,120),term:clean(utmRaw.term,120)};
  const entity=(v:unknown,re:RegExp)=>typeof v==='string'&&re.test(v)?v.toLowerCase():undefined;
  const enumValue=<T extends string>(v:unknown,allowed:readonly T[]):T|undefined=>allowed.includes(v as T)?v as T:undefined;
  const legs=typeof e.slipLegCount==='number'&&Number.isInteger(e.slipLegCount)&&e.slipLegCount>=0&&e.slipLegCount<=10?e.slipLegCount:undefined;
  let props:ClientEvent['props'];
  if(e.props&&typeof e.props==='object'&&!Array.isArray(e.props)){
    props={};for(const [k,v] of Object.entries(e.props as Record<string,unknown>).slice(0,12)){
      if(SECRET_LIKE.test(k))return null;
      if(typeof v==='number'&&Number.isFinite(v))props[k.slice(0,32)]=v;
      else if(typeof v==='boolean'||v===null)props[k.slice(0,32)]=v;
      else if(typeof v==='string'){const s=clean(v,120);if(s!==undefined)props[k.slice(0,32)]=s;else if(SECRET_LIKE.test(v)||EMAIL_LIKE.test(v))return null;}
    }
  }
  let session:ClientEvent['session'];
  if(e.session&&typeof e.session==='object'){
    const s=e.session as Record<string,unknown>;const landingPath=clean(s.landingPath,240);
    if(landingPath&&landingPath.startsWith('/')&&(PAGE_TYPES as readonly string[]).includes(String(s.landingPageType))&&(s.visitorKind==='NEW'||s.visitorKind==='RETURNING'))
      session={landingPath,landingPageType:s.landingPageType as PageType,referrerHost:clean(s.referrerHost,120),visitorKind:s.visitorKind};
  }
  return {eventId:String(e.eventId).toLowerCase(),eventName:e.eventName,eventVersion:EVENT_VERSION,occurredAt:new Date(occurred).toISOString(),sessionId:String(e.sessionId),anonymousId:String(e.anonymousId),
    locale:e.locale as Locale,pageType:e.pageType as PageType,canonicalPath,referrerClass:e.referrerClass as ReferrerClass,utm,
    competitionSlug:entity(e.competitionSlug,SLUG),fixturePublicId:entity(e.fixturePublicId,PUBLIC_ID),teamPublicId:entity(e.teamPublicId,PUBLIC_ID),playerPublicId:entity(e.playerPublicId,PUBLIC_ID),
    bookmaker:enumValue(e.bookmaker,SOURCE_BOOKMAKER_IDS),sourceBookmaker:enumValue(e.sourceBookmaker,SOURCE_BOOKMAKER_IDS),market:enumValue(e.market,['MATCH_WINNER','TOTAL_GOALS','BTTS'] as const),
    outcome:enumValue(e.outcome,['HOME','DRAW','AWAY','OVER','UNDER','YES','NO'] as const),priceKind:enumValue(e.priceKind,['REAL','PROXY'] as const),slipLegCount:legs,
    comparisonState:enumValue(e.comparisonState,['REAL_COMPLETE','ESTIMATED_COMPLETE','INCOMPLETE'] as const),
    campaignId:typeof e.campaignId==='string'&&UUID_PATTERN.test(e.campaignId)?e.campaignId.toLowerCase():undefined,placement:clean(e.placement,80),props,session};
}

/** Page classification from the canonical path (locale-aware, derived from the existing route tables). */
export function classifyPage(pathname:string,search=''):{pageType:PageType;locale:Locale|null;competitionSlug?:string;fixturePublicId?:string;teamPublicId?:string;playerPublicId?:string}{
  const parts=pathname.split('?')[0].split('/').filter(Boolean);
  const locale=(['br','mx','en'] as const).find(l=>l===parts[0])??null;
  const params=new URLSearchParams(search.startsWith('?')?search.slice(1):search);
  const competition=params.get('competition');
  const idOf=(segment:string|undefined)=>{const m=/-([a-f0-9]{16})$/i.exec(segment??'');return m?m[1].toLowerCase():undefined;};
  if(parts[0]==='owner')return {pageType:'owner',locale};
  if(!locale)return {pageType:'other',locale};
  const second=parts[1],third=parts[2];
  if(!second)return {pageType:'home',locale};
  if(['football','futebol','futbol'].includes(second))return competition&&SLUG.test(competition)?{pageType:'competition',locale,competitionSlug:competition}:{pageType:'football',locale};
  if(['live','ao-vivo','en-vivo'].includes(second))return {pageType:'live',locale};
  if((second==='matches'&&third==='today')||(second==='jogos'&&third==='hoje')||(second==='partidos'&&third==='hoy'))return {pageType:'today',locale};
  if(['match','jogo','partido'].includes(second))return {pageType:'match',locale,fixturePublicId:idOf(third)};
  if(['team','time','equipo'].includes(second))return {pageType:'team',locale,teamPublicId:idOf(third)};
  if(['player','jogador','jugador'].includes(second))return {pageType:'player',locale,playerPublicId:idOf(third)};
  if(['my-matches','meus-jogos','mis-partidos'].includes(second))return {pageType:'my_matches',locale};
  if(['sign-in','entrar','iniciar-sesion'].includes(second))return {pageType:'sign_in',locale};
  if(['account','conta','cuenta'].includes(second))return {pageType:'account',locale};
  if(['search','busca','buscar'].includes(second))return {pageType:'search',locale};
  if(/^(how-|como-|favoritos|favorites)/.test(second))return {pageType:'help',locale};
  if(/(privacy|privacidade|privacidad|terms|termos|terminos|responsible|responsavel|responsable|affiliate|afiliad|cookies)/.test(second))return {pageType:'legal',locale};
  return {pageType:'other',locale};
}

const SEARCH_HOSTS:Array<[RegExp,ReferrerClass]>=[[/(^|\.)google\./,'google_organic'],[/(^|\.)bing\.com$/,'bing_organic'],[/(^|\.)(duckduckgo\.com|yahoo\.|yandex\.|baidu\.com|ecosia\.org)/,'other_search']];
const SOCIAL_HOSTS=/(^|\.)(facebook\.com|fb\.com|instagram\.com|twitter\.com|x\.com|t\.co|tiktok\.com|youtube\.com|youtu\.be|reddit\.com|linkedin\.com|whatsapp\.com|telegram\.org|t\.me|threads\.net|pinterest\.)/;
/** Referrer class for a landing; UTM medium overrides when it says paid/social/email. */
export function classifyReferrer(referrer:string|null|undefined,ownHost:string,utmMedium?:string|null,utmSource?:string|null):{referrerClass:ReferrerClass;referrerHost?:string}{
  const medium=(utmMedium??'').toLowerCase(),source=(utmSource??'').toLowerCase();
  if(/^(cpc|ppc|paid|display|paidsocial|cpm)$/.test(medium))return {referrerClass:'paid'};
  if(medium==='social'||/(facebook|instagram|twitter|tiktok|x\.com)/.test(source))return {referrerClass:'social'};
  let host='';try{host=referrer?new URL(referrer).hostname.toLowerCase():'';}catch{host='';}
  if(!host)return {referrerClass:utmSource?'referral':'direct'};
  if(host===ownHost.toLowerCase()||host.endsWith('.'+ownHost.toLowerCase()))return {referrerClass:'internal',referrerHost:host};
  for(const [re,cls] of SEARCH_HOSTS)if(re.test(host))return {referrerClass:cls,referrerHost:host};
  if(SOCIAL_HOSTS.test(host))return {referrerClass:'social',referrerHost:host};
  return {referrerClass:'referral',referrerHost:host};
}
export function parseUtm(search:string):EventContext['utm']{
  const p=new URLSearchParams(search.startsWith('?')?search.slice(1):search);
  const get=(k:string,max:number)=>{const v=p.get(k);return v?v.trim().slice(0,max).toLowerCase():undefined;};
  return {source:get('utm_source',80),medium:get('utm_medium',80),campaign:get('utm_campaign',120),content:get('utm_content',120),term:get('utm_term',120)};
}
export const LEG_BUCKETS=['1','2','3','4','5+'] as const;
export const legBucket=(n:number)=>n>=5?'5+':n<=0?'0':String(n);
/** Obvious non-user traffic. Deliberately coarse: no fingerprinting, no scoring. */
export const BOT_UA=/bot|crawler|spider|slurp|headless|lighthouse|playwright|puppeteer|pagespeed|gtmetrix|curl\/|wget\/|python-requests|node-fetch|undici|go-http-client|vercel-screenshot|facebookexternalhit|whatsapp|telegrambot/i;
