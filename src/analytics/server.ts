import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {requestOwnerSession} from '@/owner/session';
import {requestCountry} from '@/odds/commercial-geo';
import {geoFromCountry,type Geo} from '@/config/geo';
import {BOT_UA,EVENT_VERSION,ID_PATTERN,MAX_BATCH_EVENTS,classifyPage,classifyReferrer,isClientEvent,isServerEvent,parseClientEvent,parseUtm,type ClientEvent,type EventEntities,type Locale,type ServerEventName,type TrafficClass} from './taxonomy';

export interface IngestionSummary {status:number;accepted:number;duplicates:number;rejected:number;unknown:number;missingSession:number;oversized:number;trafficClass:TrafficClass|null;}
const ok=(summary:IngestionSummary)=>summary;

/** Coarse, honest traffic classification: owner session, explicit QA marker, obvious crawlers. No scoring, no fingerprints. */
export function classifyTraffic(headers:Headers,qa=false):TrafficClass{
  if(requestOwnerSession(headers))return 'OWNER';
  if(qa||headers.get('x-livasports-qa')==='1')return 'QA';
  const ua=headers.get('user-agent')??'';
  if(!ua||BOT_UA.test(ua)||headers.get('purpose')==='prefetch'||headers.get('sec-purpose')?.includes('prefetch'))return 'BOT';
  return 'HUMAN';
}
export function analyticsIds(headers:Headers):{anonymousId:string|null;sessionId:string|null}{
  const cookie=headers.get('cookie')??'';
  const get=(name:string)=>{const m=new RegExp(`(?:^|; )${name}=([A-Za-z0-9_-]{16,64})`).exec(cookie);return m?.[1]??null;};
  return {anonymousId:get('ls_aid'),sessionId:get('ls_sid')};
}
const sameOrigin=(request:Request)=>{const site=request.headers.get('sec-fetch-site');if(site&&site!=='same-origin'&&site!=='none')return false;
  const origin=request.headers.get('origin');if(!origin)return true;try{return new URL(origin).host===new URL(request.url).host;}catch{return false;}};

interface ResolvedEntities {competitionId:string|null;fixtureId:string|null;teamId:string|null;playerId:string|null;}
async function resolveEntities(db:QueryExecutor,events:readonly ClientEvent[]):Promise<Map<ClientEvent,ResolvedEntities>>{
  const slugs=[...new Set(events.map(e=>e.competitionSlug).filter((v):v is string=>!!v))],fixtures=[...new Set(events.map(e=>e.fixturePublicId).filter((v):v is string=>!!v))];
  const teams=[...new Set(events.map(e=>e.teamPublicId).filter((v):v is string=>!!v))],players=[...new Set(events.map(e=>e.playerPublicId).filter((v):v is string=>!!v))];
  const [c,f,t,p]=await Promise.all([
    slugs.length?db.query('SELECT id,slug FROM competitions WHERE slug=ANY($1::text[])',[slugs]):{rows:[]},
    fixtures.length?db.query('SELECT id,public_id,competition_id FROM fixtures WHERE public_id=ANY($1::text[])',[fixtures]):{rows:[]},
    teams.length?db.query('SELECT id,public_id FROM teams WHERE public_id=ANY($1::text[])',[teams]):{rows:[]},
    players.length?db.query('SELECT id,public_id FROM players WHERE public_id=ANY($1::text[])',[players]):{rows:[]},
  ]);
  const cm=new Map(c.rows.map(r=>[String(r.slug),String(r.id)])),fm=new Map(f.rows.map(r=>[String(r.public_id),{id:String(r.id),competition:String(r.competition_id)}]));
  const tm=new Map(t.rows.map(r=>[String(r.public_id),String(r.id)])),pm=new Map(p.rows.map(r=>[String(r.public_id),String(r.id)]));
  const out=new Map<ClientEvent,ResolvedEntities>();
  for(const e of events){const fx=e.fixturePublicId?fm.get(e.fixturePublicId):undefined;
    out.set(e,{competitionId:(e.competitionSlug?cm.get(e.competitionSlug):undefined)??fx?.competition??null,fixtureId:fx?.id??null,teamId:e.teamPublicId?tm.get(e.teamPublicId)??null:null,playerId:e.playerPublicId?pm.get(e.playerPublicId)??null:null});}
  return out;
}
async function quality(db:QueryExecutor,delta:Partial<Record<'accepted'|'duplicates'|'rejected'|'unknown_events'|'missing_session'|'oversized'|'server_events',number>>,lagSeconds=0){
  try{await db.query(`INSERT INTO analytics_ingestion_quality(bucket,accepted,duplicates,rejected,unknown_events,missing_session,oversized,server_events,max_lag_seconds)
    VALUES(date_trunc('hour',now()),$1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(bucket) DO UPDATE SET accepted=analytics_ingestion_quality.accepted+excluded.accepted,duplicates=analytics_ingestion_quality.duplicates+excluded.duplicates,
    rejected=analytics_ingestion_quality.rejected+excluded.rejected,unknown_events=analytics_ingestion_quality.unknown_events+excluded.unknown_events,missing_session=analytics_ingestion_quality.missing_session+excluded.missing_session,
    oversized=analytics_ingestion_quality.oversized+excluded.oversized,server_events=analytics_ingestion_quality.server_events+excluded.server_events,max_lag_seconds=GREATEST(analytics_ingestion_quality.max_lag_seconds,excluded.max_lag_seconds)`,
    [delta.accepted??0,delta.duplicates??0,delta.rejected??0,delta.unknown_events??0,delta.missing_session??0,delta.oversized??0,delta.server_events??0,Math.max(0,Math.round(lagSeconds))]);}catch{/* counters are best effort */}
}
const INTERACTION=new Set(['market_open','odds_selected','slip_created','slip_leg_added','slip_opened','bookmaker_comparison_viewed','affiliate_cta_clicked','search_used','sign_in_started','stake_changed']);
/** Analytics measures trusted physical GEO, never a route or signed owner preview. */
export const analyticsGeo=(headers:Headers):Geo=>geoFromCountry(requestCountry(headers));
async function upsertSessions(db:QueryExecutor,events:readonly ClientEvent[],traffic:TrafficClass,geo:Geo,userId:string|null){
  for(const e of events){
    if(e.session&&(e.eventName==='session_started'||e.eventName==='returning_session_started')){
      const ref=classifyReferrer(e.session.referrerHost?`https://${e.session.referrerHost}/`:null,'livasports.com',e.utm.medium,e.utm.source);
      await db.query(`INSERT INTO analytics_sessions(session_id,anonymous_id,user_id,started_at,last_seen_at,traffic_class,visitor_kind,locale,geo,landing_path,landing_page_type,referrer_class,referrer_host,utm_source,utm_medium,utm_campaign,utm_content,utm_term)
        VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(session_id) DO NOTHING`,
        [e.sessionId,e.anonymousId,userId,e.occurredAt,traffic,e.session.visitorKind,e.locale,geo,e.session.landingPath.slice(0,240),e.session.landingPageType,e.referrerClass==='internal'?'direct':e.referrerClass,ref.referrerHost??e.session.referrerHost??null,
          e.utm.source??null,e.utm.medium??null,e.utm.campaign??null,e.utm.content??null,e.utm.term??null]);
    }
  }
  const bySession=new Map<string,ClientEvent[]>();for(const e of events){const list=bySession.get(e.sessionId)??[];list.push(e);bySession.set(e.sessionId,list);}
  for(const [sessionId,list] of bySession){
    const last=list[list.length-1];const pageViews=list.filter(e=>e.eventName==='page_viewed').length;
    const firstAction=list.find(e=>INTERACTION.has(e.eventName))?.eventName??null;const engaged=list.some(e=>INTERACTION.has(e.eventName));
    const lastUtm=parseUtm(last.canonicalPath.includes('?')?last.canonicalPath.slice(last.canonicalPath.indexOf('?')):'');
    // The session row may not exist yet when a client batch arrives out of order; it is created on the start event and then enriched.
    await db.query(`INSERT INTO analytics_sessions(session_id,anonymous_id,user_id,started_at,last_seen_at,traffic_class,visitor_kind,locale,geo,landing_path,landing_page_type,referrer_class,event_count,page_views,engaged,first_action,last_utm_campaign)
      VALUES($1,$2,$3,$4,$4,$5,'NEW',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(session_id) DO UPDATE SET last_seen_at=GREATEST(analytics_sessions.last_seen_at,excluded.last_seen_at),event_count=analytics_sessions.event_count+excluded.event_count,page_views=analytics_sessions.page_views+excluded.page_views,
        engaged=analytics_sessions.engaged OR excluded.engaged OR analytics_sessions.page_views+excluded.page_views>=2,first_action=COALESCE(analytics_sessions.first_action,excluded.first_action),
        user_id=COALESCE(analytics_sessions.user_id,excluded.user_id),last_utm_campaign=COALESCE(excluded.last_utm_campaign,analytics_sessions.last_utm_campaign),
        -- a session that turns out to be owner/QA/bot traffic later (e.g. owner signs in mid-session) is excluded as a whole
        traffic_class=CASE WHEN excluded.traffic_class<>'HUMAN' THEN excluded.traffic_class ELSE analytics_sessions.traffic_class END
      WHERE analytics_sessions.anonymous_id=excluded.anonymous_id`,
      [sessionId,last.anonymousId,userId,last.occurredAt,traffic,last.locale,geo,last.canonicalPath.slice(0,240),last.pageType,last.referrerClass==='internal'?'direct':last.referrerClass,list.length,pageViews,engaged||pageViews>=2,firstAction,lastUtm.campaign??null]);
  }
}
/** One controlled client ingestion boundary: validation, allowlist, size, same-origin, dedupe, rate limit, classification. Never throws. */
export async function ingestClientBatch(request:Request,body:unknown,db?:DatabaseClient):Promise<IngestionSummary>{
  const summary:IngestionSummary={status:204,accepted:0,duplicates:0,rejected:0,unknown:0,missingSession:0,oversized:0,trafficClass:null};
  if(!sameOrigin(request))return ok({...summary,status:403});
  const b=body as {v?:unknown;batch?:unknown;qa?:unknown}|null;
  if(!b||b.v!==EVENT_VERSION||!Array.isArray(b.batch)||b.batch.length===0)return ok({...summary,status:400,rejected:1});
  if(b.batch.length>MAX_BATCH_EVENTS)return ok({...summary,status:413,oversized:1,rejected:b.batch.length});
  const traffic=classifyTraffic(request.headers,b.qa===true);summary.trafficClass=traffic;
  const events:ClientEvent[]=[];
  for(const raw of b.batch){
    const name=(raw as {eventName?:unknown})?.eventName;
    if(isServerEvent(name)){summary.rejected++;continue;}// authoritative outcomes cannot be forged from the client
    const parsed=parseClientEvent(raw);
    if(!parsed){summary.rejected++;if(!isClientEvent(name))summary.unknown++;if(typeof (raw as {sessionId?:unknown})?.sessionId!=='string')summary.missingSession++;continue;}
    const age=Date.now()-Date.parse(parsed.occurredAt);
    if(age<-120000||age>7*86400000){summary.rejected++;continue;}
    events.push(parsed);
  }
  if(!events.length){const client=db??open();if(client){try{await quality(client,{rejected:summary.rejected,unknown_events:summary.unknown,missing_session:summary.missingSession,oversized:summary.oversized});}finally{if(!db)await client.close();}}return ok({...summary,status:summary.rejected?400:204});}
  // One request is one browser identity. Mixed identities used to bypass the first-visitor counter.
  if(events.some(e=>e.anonymousId!==events[0].anonymousId||e.sessionId!==events[0].sessionId))return ok({...summary,status:400,rejected:summary.rejected+events.length});
  const client=db??open();if(!client)return ok({...summary,status:503});
  try{
    const anonymous=events[0].anonymousId;
    const rate=await client.query(`SELECT count(*)::int AS n FROM analytics_events WHERE anonymous_id=$1 AND received_at>now()-interval '1 minute'`,[anonymous]);
    if(Number(rate.rows[0]?.n??0)+events.length>240){await quality(client,{rejected:events.length});return ok({...summary,status:429,rejected:summary.rejected+events.length});}
    // The auth module is loaded lazily so analytics never pulls the auth runtime into unrelated request paths.
    const user=traffic==='HUMAN'||traffic==='QA'?await import('@/auth/session').then(m=>m.currentUser()).catch(()=>null):null;const userId=user?.id??null;
    const geo=analyticsGeo(request.headers);
    const entities=await resolveEntities(client,events);
    let lag=0;const inserted:ClientEvent[]=[];
    for(const e of events){
      const r=entities.get(e)!;lag=Math.max(lag,(Date.now()-Date.parse(e.occurredAt))/1000);
      const result=await client.query(`INSERT INTO analytics_events(event_id,event_name,event_version,source,occurred_at,session_id,anonymous_id,user_id,traffic_class,locale,geo,page_type,canonical_path,referrer_class,
          utm_source,utm_medium,utm_campaign,utm_content,utm_term,competition_id,fixture_id,team_id,player_id,bookmaker,market,outcome,price_kind,slip_leg_count,comparison_state,campaign_id,placement,props)
        VALUES($1,$2,$3,'client',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb) ON CONFLICT(event_id) DO NOTHING RETURNING id`,
        [e.eventId,e.eventName,EVENT_VERSION,e.occurredAt,e.sessionId,e.anonymousId,userId,traffic,e.locale,geo,e.pageType,e.canonicalPath,e.referrerClass,
          e.utm.source??null,e.utm.medium??null,e.utm.campaign??null,e.utm.content??null,e.utm.term??null,r.competitionId,r.fixtureId,r.teamId,r.playerId,e.bookmaker??null,e.market??null,e.outcome??null,e.priceKind??null,
          e.slipLegCount??null,e.comparisonState??null,e.campaignId??null,e.placement??null,JSON.stringify({...e.props,...(e.sourceBookmaker?{sourceBookmaker:e.sourceBookmaker}:{}),...(e.bookmaker?{displayBookmaker:e.bookmaker}:{}),...(e.priceKind?{priceClass:e.priceKind}:{})})]);
      if(result.rowCount){summary.accepted++;inserted.push(e);}else summary.duplicates++;
    }
    if(inserted.length)await upsertSessions(client,inserted,traffic,geo,userId);
    // A session that proves to be owner/QA/bot traffic takes every earlier row of that session with it (bounded by the session index).
    if(inserted.length&&traffic!=='HUMAN')await client.query(`UPDATE analytics_events SET traffic_class=$2 WHERE session_id=ANY($1::text[]) AND anonymous_id=$3 AND traffic_class='HUMAN'`,[[...new Set(inserted.map(e=>e.sessionId))],traffic,anonymous]);
    await quality(client,{accepted:summary.accepted,duplicates:summary.duplicates,rejected:summary.rejected,unknown_events:summary.unknown,missing_session:summary.missingSession,oversized:summary.oversized},lag);
    return ok(summary);
  }catch{return ok({...summary,status:503});}
  finally{if(!db)await client.close();}
}
function open():DatabaseClient|null{const url=databaseUrl();return url?new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:3_000}):null;}

export interface ServerEventInput extends EventEntities {
  name:ServerEventName;headers:Headers;locale:Locale;userId?:string|null;canonicalPath?:string;trafficClass?:TrafficClass;props?:Record<string,string|number|boolean|null>;
  /** Internal stable UUID for authoritative outcomes already deduplicated by a ledger. Never accepted from a client event. */
  eventId?:string;
  competitionId?:string|null;fixtureId?:string|null;teamId?:string|null;
}
/** Server-authoritative events (affiliate redirect, sign-in/out, favorites). Attribution comes from the first-party cookies; never throws. */
export async function recordServerEvent(input:ServerEventInput,db?:DatabaseClient):Promise<boolean>{
  const client=db??open();if(!client)return false;
  try{
    const ids=analyticsIds(input.headers);
    const anonymousId=ids.anonymousId&&ID_PATTERN.test(ids.anonymousId)?ids.anonymousId:`noid_${cryptoId()}`;
    const sessionId=ids.sessionId&&ID_PATTERN.test(ids.sessionId)?ids.sessionId:`nosess_${cryptoId()}`;
    // The redirect path labels every trusted click HUMAN; an owner cookie on the same request is still the owner.
    const detected=classifyTraffic(input.headers);
    const traffic=input.trafficClass&&!(input.trafficClass==='HUMAN'&&detected==='OWNER')?input.trafficClass:detected;
    const path=(input.canonicalPath??'/').slice(0,240);const page=classifyPage(path);const utm=parseUtm(path.includes('?')?path.slice(path.indexOf('?')):'');
    const ref=classifyReferrer(input.headers.get('referer'),'livasports.com',utm.medium,utm.source);
    const geo=analyticsGeo(input.headers);
    const eventId=input.eventId??crypto.randomUUID();
    const inserted=await client.query(`INSERT INTO analytics_events(event_id,event_name,event_version,source,occurred_at,session_id,anonymous_id,user_id,traffic_class,locale,geo,page_type,canonical_path,referrer_class,
        utm_source,utm_medium,utm_campaign,competition_id,fixture_id,team_id,bookmaker,market,slip_leg_count,comparison_state,campaign_id,placement,props)
      SELECT $1,$2,$3,'server',now(),$4,$5,$6,$7,$8,$9,$10,$11,COALESCE(s.referrer_class,$12),COALESCE(s.utm_source,$13),COALESCE(s.utm_medium,$14),COALESCE(s.utm_campaign,$15),$16,$17,$18,$19,$20,$21,$22,$23,$24,
        $25::jsonb || CASE WHEN s.referrer_class='social' THEN jsonb_build_object('revenueAcquisition','livasports_social') ELSE '{}'::jsonb END
      FROM (SELECT 1) anchor LEFT JOIN analytics_sessions s ON s.session_id=$4 AND s.anonymous_id=$5
      ON CONFLICT(event_id) DO NOTHING`,
      [eventId,input.name,EVENT_VERSION,sessionId,anonymousId,input.userId??null,traffic,input.locale,geo,page.pageType,path,ref.referrerClass==='internal'?'unknown':ref.referrerClass,utm.source??null,utm.medium??null,utm.campaign??null,
          input.competitionId??null,input.fixtureId??null,input.teamId??null,input.bookmaker??null,input.market??null,input.slipLegCount??null,input.comparisonState??null,input.campaignId??null,input.placement??null,JSON.stringify(input.props??{})]);
    if(inserted.rowCount===0)return true;
    // link the session to the authenticated user from now on (never rewrites another visitor's session)
    if(input.userId&&ids.sessionId)await client.query(`UPDATE analytics_sessions SET user_id=COALESCE(user_id,$2),last_seen_at=now(),event_count=event_count+1,engaged=true WHERE session_id=$1 AND anonymous_id=$3`,[sessionId,input.userId,anonymousId]);
    else if(ids.sessionId)await client.query(`UPDATE analytics_sessions SET last_seen_at=now(),event_count=event_count+1,engaged=true WHERE session_id=$1 AND anonymous_id=$2`,[sessionId,anonymousId]);
    if(ids.sessionId&&traffic!=='HUMAN'){
      await client.query("UPDATE analytics_sessions SET traffic_class=$3 WHERE session_id=$1 AND anonymous_id=$2 AND traffic_class='HUMAN'",[sessionId,anonymousId,traffic]);
      await client.query("UPDATE analytics_events SET traffic_class=$3 WHERE session_id=$1 AND anonymous_id=$2 AND traffic_class='HUMAN'",[sessionId,anonymousId,traffic]);
    }
    await quality(client,{server_events:1});
    return true;
  }catch{return false;}
  finally{if(!db)await client.close();}
}
const cryptoId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,24);

/** Await only registration with Next's response lifecycle, not analytics I/O. Failed telemetry never delays a user mutation. */
export async function deferServerEvent(input:ServerEventInput):Promise<void>{
  try{const {after}=await import('next/server');after(async()=>{await recordServerEvent(input);});}
  catch{console.warn('[LivaSports] {"event":"analytics-defer-unavailable","providerRequests":0}');}
}
