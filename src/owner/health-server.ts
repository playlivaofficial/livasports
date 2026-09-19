import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {ownerConfigured,requestOwnerSession} from './session';
import {ownerHeaders} from './server';
import {boundedJson} from '@/slip/server';
import {readReliabilityHealth,type ReliabilityHealth} from '@/odds/reliability/read';
import {acknowledgeIncident,evaluateReliability,logRecoveryAction} from '@/odds/reliability/incidents';
import {ownerActionRecentlyRan,runTargetedRefresh} from '@/odds/reliability/recovery';
import {persistCatalogRows} from '@/odds/reliability/catalog';
import {freshnessState} from '@/odds/reliability/model';
import {sendOwnerAlertTest} from './alert-test';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:ownerHeaders});
export const OWNER_HEALTH_ACTIONS=['recheck','refresh-target','retry-mapping','acknowledge','test-alert'] as const;
export type OwnerHealthAction=typeof OWNER_HEALTH_ACTIONS[number];
export interface OwnerHealthDependencies {
  database:()=>DatabaseClient;
  readHealth:(db:DatabaseClient)=>Promise<ReliabilityHealth>;
  evaluate:(db:DatabaseClient,source:string)=>Promise<{opened:number;resolved:number;alerts:unknown[];overall:string}>;
  refresh:(db:DatabaseClient,competition:string)=>Promise<Record<string,unknown>>;
  recentOwnerRefresh:(db:DatabaseClient)=>Promise<string|null>;
  retryMapping:(db:DatabaseClient)=>Promise<Record<string,unknown>>;
  acknowledge:(db:DatabaseClient,id:string)=>Promise<boolean>;
  providerKey:()=>string|null;
  testAlert?:typeof sendOwnerAlertTest;
}
export const productionOwnerHealthDependencies:OwnerHealthDependencies={
  database:()=>{const url=databaseUrl();if(!url)throw new Error('ODDS_DATABASE_UNAVAILABLE');return new PostgresDatabaseClient(url);},
  readHealth:db=>readReliabilityHealth(db),
  evaluate:async(db,source)=>{const r=await evaluateReliability(db,{source});return {opened:r.opened,resolved:r.resolved,alerts:r.alerts,overall:r.health.overall};},
  refresh:async(db,competition)=>runTargetedRefresh(db,process.env.ODDSPAPI_API_KEY!,competition,{trigger:'OWNER',reason:'Owner dashboard targeted refresh'}) as unknown as Record<string,unknown>,
  recentOwnerRefresh:db=>ownerActionRecentlyRan(db,'TARGETED_REFRESH'),
  retryMapping:async db=>{const raw=(await db.query("SELECT tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'")).rows[0]?.tournaments??[];const summary=await persistCatalogRows(db,raw as unknown[]);
    await logRecoveryAction(db,{trigger:'OWNER',action:'RETRY_MAPPING',reason:'Owner dashboard mapping retry (stored catalog, no provider call)',outcome:'SUCCEEDED',detail:summary});return summary;},
  acknowledge:(db,id)=>acknowledgeIncident(db,id),
  providerKey:()=>process.env.ODDSPAPI_API_KEY?.trim()||null,
};

/** GET /api/owner/health — owner session required; renders the same document the dashboard uses; never calls the provider. */
export async function ownerHealthStatus(request:Request,deps:OwnerHealthDependencies=productionOwnerHealthDependencies){
  if(!ownerConfigured())return reply({error:'OWNER_QA_NOT_CONFIGURED'},503);
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  if(new URL(request.url).search)return reply({error:'INVALID_REQUEST'},400);
  const db=deps.database();
  try{return reply({...await deps.readHealth(db),providerRequests:0});}
  catch{return reply({error:'HEALTH_UNAVAILABLE'},503);}
  finally{await db.close();}
}

/** POST /api/owner/health — bounded owner actions (P3 §23/§24): same-origin, HTTPS, JSON, session, rate-limited, budget-aware, audited. */
export async function ownerHealthAction(request:Request,deps:OwnerHealthDependencies=productionOwnerHealthDependencies){
  const url=new URL(request.url);
  if(url.search||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')!=='same-origin')return reply({error:'INVALID_ORIGIN'},403);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return reply({error:'HTTPS_REQUIRED'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'INVALID_REQUEST'},400);
  if(!ownerConfigured())return reply({error:'OWNER_QA_NOT_CONFIGURED'},503);
  if(!requestOwnerSession(request.headers))return reply({error:'UNAUTHORIZED'},401);
  let body:Record<string,unknown>;try{body=await boundedJson(request,1024) as Record<string,unknown>;}catch{return reply({error:'INVALID_REQUEST'},400);}
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','competition','incidentId','confirm','runId','phase'].includes(k)))return reply({error:'INVALID_REQUEST'},400);
  const action=body.action as OwnerHealthAction;
  if(!OWNER_HEALTH_ACTIONS.includes(action))return reply({error:'INVALID_REQUEST'},400);
  const db=deps.database();
  try{
    if(action==='test-alert'){
      if(body.confirm!==true||typeof body.runId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.runId)||!['OPENED','RESOLVED'].includes(String(body.phase)))return reply({error:'INVALID_REQUEST'},400);
      const result=await (deps.testAlert??sendOwnerAlertTest)(db,body.runId,body.phase as 'OPENED'|'RESOLVED');
      return reply({action,...result},result.ok?200:result.code==='RATE_LIMITED'?429:409);
    }
    if(action==='recheck')return reply({action,...await deps.evaluate(db,'owner')});
    if(action==='acknowledge'){
      const id=typeof body.incidentId==='string'&&/^[0-9a-f-]{36}$/.test(body.incidentId)?body.incidentId:null;
      if(!id)return reply({error:'INVALID_REQUEST'},400);
      return reply({action,acknowledged:await deps.acknowledge(db,id)});
    }
    if(action==='retry-mapping')return reply({action,...await deps.retryMapping(db)});
    // refresh-target: explicit confirmation, one provider-consuming owner action per window, bounded to one competition.
    const competition=typeof body.competition==='string'&&/^[a-z0-9-]{2,64}$/.test(body.competition)?body.competition:null;
    if(!competition)return reply({error:'INVALID_REQUEST'},400);
    if(body.confirm!==true)return reply({error:'CONFIRMATION_REQUIRED',requestCost:2},409);
    if(!deps.providerKey())return reply({error:'PROVIDER_NOT_CONFIGURED'},503);
    const recent=await deps.recentOwnerRefresh(db);
    if(recent){const response=reply({error:'RATE_LIMITED',lastRunAt:recent},429);response.headers.set('Retry-After','300');return response;}
    const result=await deps.refresh(db,competition);
    const evaluation=await deps.evaluate(db,'owner').catch(()=>null);
    return reply({action,...result,evaluation},result.ok?200:409);
  }catch(error){return reply({error:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'OWNER_ACTION_FAILED'},503);}
  finally{await db.close();}
}

export interface CompetitionDetail {
  competition:string;fixtures:Array<{publicId:string;kickoff:string;status:string;home:string;away:string;tier:string;
    quotes:Array<{bookmaker:string;market:string;status:string;observedAt:string;ttlMinutes:number|null;ageMinutes:number;freshness:string;price:string}>;mappingState:string|null;mappingReason:string|null}>;
  requests:Array<{startedAt:string;bookmaker:string|null;tournamentIds:string|null;outcome:string;httpStatus:number|null;purpose:string}>;
  decisions:Array<{startedAt:string;status:string;requests:number;feeds:string;pacing:unknown;error:string|null}>;
  actions:Array<Record<string,unknown>>;incidents:Array<Record<string,unknown>>;
}
/** Bounded incident detail for one competition (P3 §18): fixtures inside 14 days, their quotes, recent provider requests, scheduler decisions, actions. */
export async function readCompetitionDetail(db:QueryExecutor,competition:string,tournamentId:string|null,now=new Date()):Promise<CompetitionDetail>{
  const fixtures=(await db.query(`SELECT f.public_id,f.kickoff,f.status,ht.name AS home,at.name AS away,
      (SELECT json_agg(json_build_object('bookmaker',b.provider_slug,'market',o.market_code,'status',o.status,'observedAt',o.observed_at,'ttl',o.freshness_ttl_minutes,'price',o.decimal_odds) ORDER BY b.provider_slug,o.market_code)
        FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id WHERE o.fixture_id=f.id AND o.outcome_code IN ('HOME','OVER','YES') AND (o.line IS NULL OR o.line=2.5)) AS quotes,
      (SELECT mr.state FROM odds_mapping_reviews mr WHERE mr.fixture_id=f.id ORDER BY mr.observed_at DESC LIMIT 1) AS mapping_state,
      (SELECT mr.reason FROM odds_mapping_reviews mr WHERE mr.fixture_id=f.id ORDER BY mr.observed_at DESC LIMIT 1) AS mapping_reason
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE c.slug=$1 AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<=now()+interval '14 days' ORDER BY f.kickoff LIMIT 60`,[competition])).rows;
  const requests=tournamentId?(await db.query(`SELECT started_at,safe_query->>'bookmaker' AS bookmaker,safe_query->>'tournamentIds' AS tournament_ids,outcome,http_status,purpose FROM odds_provider_requests
    WHERE endpoint='/v4/odds-by-tournaments' AND $1=ANY(string_to_array(safe_query->>'tournamentIds',',')) AND started_at>now()-interval '3 days' ORDER BY started_at DESC LIMIT 12`,[tournamentId])).rows:[];
  const decisions=tournamentId?(await db.query(`SELECT started_at,status,provider_requests,error_code,result->'pacing' AS pacing,
      (SELECT string_agg((f->>'bookmaker')||':'||(f->>'tournamentIds'),' ') FROM jsonb_array_elements(coalesce(result->'feeds','[]'::jsonb)) f WHERE (f->'tournamentIds') ? $1) AS feeds
    FROM odds_sync_jobs WHERE started_at>now()-interval '12 hours' AND result->'feeds' @> $2::jsonb ORDER BY started_at DESC LIMIT 8`,[tournamentId,JSON.stringify([{tournamentIds:[tournamentId]}])])).rows:[];
  const actions=(await db.query(`SELECT at,trigger_source,action,bookmaker,tournament_id,reason,request_cost,outcome,next_retry_at,budget_remaining_after FROM odds_recovery_actions WHERE competition=$1 OR tournament_id=$2 ORDER BY at DESC LIMIT 20`,[competition,tournamentId??'']).catch(()=>({rows:[]}))).rows;
  const incidents=(await db.query(`SELECT id,classification,severity,state,opened_at,last_seen_at,resolved_at,affected_fixtures,detail,resolution FROM odds_incidents WHERE competition=$1 ORDER BY opened_at DESC LIMIT 20`,[competition]).catch(()=>({rows:[]}))).rows;
  const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v??'');
  const hours=(k:unknown)=>(new Date(iso(k)).getTime()-now.getTime())/3600000;
  return {competition,
    fixtures:fixtures.map(f=>({publicId:String(f.public_id),kickoff:iso(f.kickoff),status:String(f.status),home:String(f.home),away:String(f.away),tier:`T${[3,12,24,72,168,336].findIndex(h=>hours(f.kickoff)<=h)}`,
      quotes:((f.quotes as Array<Record<string,unknown>>)??[]).map(q=>({bookmaker:String(q.bookmaker),market:String(q.market),status:String(q.status),observedAt:iso(q.observedAt),ttlMinutes:q.ttl===null?null:Number(q.ttl),
        ageMinutes:Math.round((now.getTime()-new Date(iso(q.observedAt)).getTime())/60000),freshness:String(q.status)==='ACTIVE'?freshnessState(iso(q.observedAt),q.ttl===null?null:Number(q.ttl),now):'CLOSED',price:String(q.price)})),
      mappingState:f.mapping_state?String(f.mapping_state):null,mappingReason:f.mapping_reason?String(f.mapping_reason):null})),
    requests:requests.map(r=>({startedAt:iso(r.started_at),bookmaker:r.bookmaker?String(r.bookmaker):null,tournamentIds:r.tournament_ids?String(r.tournament_ids):null,outcome:String(r.outcome),httpStatus:r.http_status===null?null:Number(r.http_status),purpose:String(r.purpose)})),
    decisions:decisions.map(d=>({startedAt:iso(d.started_at),status:String(d.status),requests:Number(d.provider_requests),feeds:String(d.feeds??''),pacing:d.pacing??null,error:d.error_code?String(d.error_code):null})),
    actions:actions.map(a=>({...a,at:iso(a.at),next_retry_at:a.next_retry_at?iso(a.next_retry_at):null})),
    incidents:incidents.map(i=>({...i,opened_at:iso(i.opened_at),last_seen_at:iso(i.last_seen_at),resolved_at:i.resolved_at?iso(i.resolved_at):null}))};
}
