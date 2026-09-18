'use client';
import {EVENT_VERSION,MAX_BATCH_EVENTS,SESSION_WINDOW_MINUTES,classifyPage,classifyReferrer,parseUtm,type ClientEvent,type ClientEventName,type EventEntities,type PageType} from './taxonomy';

/**
 * First-party analytics client (P4). Ordinary first-party identifiers only (no fingerprinting):
 * anonymous_id (1-year cookie + localStorage), session_id (30-minute inactivity window), user_id resolved server-side
 * from the auth session. Events are queued, deduplicated, batched and sent with keepalive; failures never surface.
 */
const AID_KEY='ls_aid',SESSION_KEY='ls_session',SEEN_KEY='ls_seen',SID_COOKIE='ls_sid';
const FLUSH_MS=1500;
interface StoredSession {id:string;startedAt:number;lastSeenAt:number;landingPath:string;landingPageType:PageType;referrerClass:ClientEvent['referrerClass'];referrerHost?:string;utm:ClientEvent['utm'];visitorKind:'NEW'|'RETURNING';sentStart:boolean;}
const state={queue:[] as ClientEvent[],timer:null as ReturnType<typeof setTimeout>|null,keys:new Set<string>(),bound:false,lastPage:'' as string};
const randomId=()=>{try{return crypto.randomUUID().replace(/-/g,'');}catch{return Array.from({length:32},()=>'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random()*36)]).join('');}};
const read=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const write=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* storage may be unavailable; analytics stays best-effort */}};
const cookie=(name:string,value:string,maxAge:number)=>{try{document.cookie=`${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}catch{/* ignore */}};

export function anonymousId():string{
  let id=read(AID_KEY);
  if(!id){const m=/(?:^|; )ls_aid=([A-Za-z0-9_-]{16,64})/.exec(typeof document==='undefined'?'':document.cookie);id=m?.[1]??randomId();write(AID_KEY,id);}
  cookie(AID_KEY,id,365*86400);
  return id;
}
function loadSession():StoredSession|null{try{const raw=read(SESSION_KEY);return raw?JSON.parse(raw) as StoredSession:null;}catch{return null;}}
function saveSession(s:StoredSession){write(SESSION_KEY,JSON.stringify(s));cookie(SID_COOKIE,s.id,SESSION_WINDOW_MINUTES*60);}
/** Deterministic session: reused while activity is inside the window; a new session freezes first-touch attribution. */
export function currentSession(now=Date.now()):StoredSession{
  const existing=loadSession();
  if(existing&&now-existing.lastSeenAt<SESSION_WINDOW_MINUTES*60000){existing.lastSeenAt=now;saveSession(existing);return existing;}
  const page=classifyPage(location.pathname,location.search),utm=parseUtm(location.search);
  const ref=classifyReferrer(document.referrer,location.hostname,utm.medium,utm.source);
  const seenBefore=!!read(SEEN_KEY)||!!existing;
  const session:StoredSession={id:randomId(),startedAt:now,lastSeenAt:now,landingPath:location.pathname+(location.search||''),landingPageType:page.pageType,
    referrerClass:ref.referrerClass==='internal'?'direct':ref.referrerClass,referrerHost:ref.referrerHost,utm,visitorKind:seenBefore?'RETURNING':'NEW',sentStart:false};
  write(SEEN_KEY,String(now));saveSession(session);
  return session;
}
function context(){
  const page=classifyPage(location.pathname,location.search);const session=currentSession();
  return {page,session,base:{locale:page.locale??'en',pageType:page.pageType,canonicalPath:(location.pathname+(location.search||'')).slice(0,240),referrerClass:session.referrerClass,utm:session.utm}};
}
function flush(sync=false){
  if(state.timer){clearTimeout(state.timer);state.timer=null;}
  if(!state.queue.length)return;
  const batch=state.queue.splice(0,MAX_BATCH_EVENTS);const body=JSON.stringify({v:EVENT_VERSION,batch});
  try{
    if(sync&&typeof navigator.sendBeacon==='function'&&navigator.sendBeacon('/api/events',new Blob([body],{type:'application/json'})))return;
    void fetch('/api/events',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body,credentials:'same-origin'}).catch(()=>undefined);
  }catch{/* analytics never blocks the product */}
  if(state.queue.length)state.timer=setTimeout(()=>flush(),FLUSH_MS);
}
function bind(){
  if(state.bound||typeof window==='undefined')return;state.bound=true;
  addEventListener('pagehide',()=>flush(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush(true);});
}
/** Queue one event. `dedupeKey` collapses React remounts / reloads inside the session (same logical action once). */
const optedOut=()=>{try{return navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true;}catch{return false;}};
export function track(eventName:ClientEventName,entities:EventEntities={},options:{dedupeKey?:string;props?:ClientEvent['props']}={}):void{
  if(typeof window==='undefined'||optedOut())return;// DNT / Global Privacy Control are honoured, as for commercial measurement
  try{
    bind();
    const {session,base}=context();
    if(options.dedupeKey){const key=`${session.id}:${eventName}:${options.dedupeKey}`;if(state.keys.has(key))return;state.keys.add(key);
      try{const stored=sessionStorage.getItem('ls_keys');const set=new Set<string>(stored?JSON.parse(stored):[]);if(set.has(key))return;set.add(key);sessionStorage.setItem('ls_keys',JSON.stringify([...set].slice(-400)));}catch{/* ignore */}}
    const event:ClientEvent={eventId:(()=>{try{return crypto.randomUUID();}catch{return `${randomId().slice(0,8)}-${randomId().slice(0,4)}-4${randomId().slice(0,3)}-a${randomId().slice(0,3)}-${randomId().slice(0,12)}`;}})(),
      eventName,eventVersion:EVENT_VERSION,occurredAt:new Date().toISOString(),sessionId:session.id,anonymousId:anonymousId(),...base,...entities,...(options.props?{props:options.props}:{})};
    state.queue.push(event);
    if(!state.timer)state.timer=setTimeout(()=>flush(),FLUSH_MS);
  }catch{/* never throw into product code */}
}
/** Called on every route change: session start (once), landing (first page of the session), page view and entity views. */
export function trackNavigation(pathname:string,search:string):void{
  if(typeof window==='undefined')return;
  try{
    const key=pathname+search;if(state.lastPage===key)return;state.lastPage=key;
    const session=currentSession();const page=classifyPage(pathname,search);
    if(!session.sentStart){
      session.sentStart=true;saveSession(session);
      track(session.visitorKind==='RETURNING'?'returning_session_started':'session_started',{},{dedupeKey:'start',props:{},});
      // first-touch attribution rides with the start event
      const last=state.queue[state.queue.length-1];if(last)last.session={landingPath:session.landingPath,landingPageType:session.landingPageType,referrerHost:session.referrerHost,visitorKind:session.visitorKind};
      track('landing_viewed',{},{dedupeKey:'landing'});
    }
    track('page_viewed',{},{dedupeKey:key});
    const entity:EventEntities={competitionSlug:page.competitionSlug,fixturePublicId:page.fixturePublicId,teamPublicId:page.teamPublicId,playerPublicId:page.playerPublicId};
    if(page.pageType==='competition'&&page.competitionSlug)track('competition_viewed',entity,{dedupeKey:page.competitionSlug});
    else if(page.pageType==='match'&&page.fixturePublicId)track('match_viewed',entity,{dedupeKey:page.fixturePublicId});
    else if(page.pageType==='team'&&page.teamPublicId)track('team_viewed',entity,{dedupeKey:page.teamPublicId});
    else if(page.pageType==='player'&&page.playerPublicId)track('player_viewed',entity,{dedupeKey:page.playerPublicId});
    else if(page.pageType==='my_matches')track('my_matches_viewed',{},{dedupeKey:'my-matches'});
  }catch{/* never throw into navigation */}
}
/** Bridge from the legacy product-event emitter: maps M4–M8 interaction events onto the P4 taxonomy without double-sending. */
export function bridgeLegacyEvent(payload:Record<string,unknown>):void{
  try{
    const name=String(payload.eventName??'');const sel=payload.selection as {fixturePublicId?:string;market?:string;outcome?:string}|undefined;
    const bookmaker=typeof payload.bookmaker==='string'?payload.bookmaker as EventEntities['bookmaker']:undefined;
    const fixture=typeof payload.fixturePublicId==='string'?payload.fixturePublicId:sel?.fixturePublicId;
    const common:EventEntities={fixturePublicId:fixture,bookmaker,market:(sel?.market??payload.market) as EventEntities['market'],outcome:sel?.outcome as EventEntities['outcome'],placement:typeof payload.placement==='string'?payload.placement:undefined};
    const legs=typeof payload.legCount==='number'?payload.legCount:typeof payload.selectionCount==='number'?payload.selectionCount:undefined;
    switch(name){
      case 'odds_module_view':track('odds_visible',common,{dedupeKey:`${fixture}:${common.placement}`});break;
      case 'odds_bookmaker_click':case 'affiliate_outbound_click':track('affiliate_cta_clicked',common,{dedupeKey:`${fixture}:${bookmaker}:${common.market}:${Date.now()>>12}`});break;
      case 'slip_selection_add':case 'slip_selection_replace':
        track('odds_selected',{...common,priceKind:payload.priceKind as EventEntities['priceKind'],slipLegCount:legs},{dedupeKey:`${fixture}:${common.market}:${common.outcome}:${legs}`});
        if(legs===1&&name==='slip_selection_add')track('slip_created',{slipLegCount:1},{dedupeKey:`created:${Date.now()>>14}`});
        if(name==='slip_selection_add')track('slip_leg_added',{...common,slipLegCount:legs},{dedupeKey:`leg:${fixture}:${common.market}:${legs}`});break;
      case 'slip_selection_remove':track('slip_leg_removed',{...common,slipLegCount:legs});break;
      case 'slip_clear':track('slip_cleared',{slipLegCount:legs});break;
      case 'slip_open':track('slip_opened',{slipLegCount:legs},{dedupeKey:`open:${Date.now()>>14}`});break;
      case 'slip_comparison_view':track('bookmaker_comparison_viewed',{slipLegCount:legs,comparisonState:payload.comparisonState as EventEntities['comparisonState']},{dedupeKey:`cmp:${legs}:${payload.comparisonState}`});break;
      case 'slip_bookmaker_complete':case 'slip_bookmaker_partial':track('bookmaker_comparison_viewed',{bookmaker,slipLegCount:legs,comparisonState:payload.comparisonState as EventEntities['comparisonState']},{dedupeKey:`cmpb:${bookmaker}:${legs}:${payload.comparisonState}`});break;
      case 'slip_bookmaker_click':track('affiliate_cta_clicked',{bookmaker,slipLegCount:legs,placement:'slip-comparison'},{dedupeKey:`slipcta:${bookmaker}:${legs}:${Date.now()>>12}`});break;
      case 'affiliate_impression':track('affiliate_cta_viewed',{placement:typeof payload.placementId==='string'?payload.placementId:undefined,bookmaker,campaignId:typeof payload.campaignId==='string'?payload.campaignId:undefined},{dedupeKey:`imp:${payload.placementId}:${bookmaker}`});break;
      case 'affiliate_embed_click':track('affiliate_cta_clicked',{placement:typeof payload.placementId==='string'?payload.placementId:undefined,bookmaker,campaignId:typeof payload.campaignId==='string'?payload.campaignId:undefined},{dedupeKey:`embed:${payload.placementId}:${bookmaker}:${Date.now()>>12}`});break;
      default:break;
    }
  }catch{/* bridge is optional */}
}
