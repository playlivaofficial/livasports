import type {QueryExecutor} from '@/database/client';
import {COVERAGE_WINDOWS,readCoverageInputs,reportWindow,emptyCounts,type CompetitionCoverageInput,type CoverageWindow,type CoverageWindowCounts,type CoverageWindowReport} from '../coverage-health';
import {budgetHealth,type BudgetGovernor} from '../budget';
import {LIVE_ODDS_CAPABILITY} from '../live-capability';
import {classifyCompetition,classifyGlobal,worstHealth,type CatalogMappingState,type CompetitionBaseline,type CompetitionHealth,type FeedEvidence,type HealthIssue,type QuoteAges,type ReliabilityInput} from './classify';
import {HEALTH_CONTRACT_VERSION,HEALTH_RANK,type HealthState} from './model';
import {readFourSourceHealth,type FourSourceHealth} from '../four-source-health';

export interface IncidentRecord {
  id:string;competition:string;classification:string;severity:'WARNING'|'CRITICAL';state:'OPEN'|'ACKNOWLEDGED'|'RESOLVED';
  openedAt:string;lastSeenAt:string;acknowledgedAt:string|null;resolvedAt:string|null;affectedFixtures:number;recoveryAttempts:number;
  detail:Record<string,unknown>;resolution:string|null;alertSentAt:string|null;alertSeverity:string|null;alertChannel:string|null;
}
export interface RecoveryActionRecord {
  id:number;at:string;trigger:string;action:string;competition:string|null;bookmaker:string|null;tournamentId:string|null;reason:string;
  requestCost:number;outcome:string;nextRetryAt:string|null;budgetRemainingAfter:number|null;detail:Record<string,unknown>;
}
export interface CompetitionReliability extends CompetitionHealth {windows:Record<CoverageWindow,CoverageWindowReport>;feeds:FeedEvidence[];baseline:CompetitionBaseline|null;}
export interface ReliabilityHealth {
  fourSource?:FourSourceHealth;
  version:typeof HEALTH_CONTRACT_VERSION;generatedAt:string;overall:HealthState;
  counts:Record<HealthState,number>;
  horizons:Record<CoverageWindow,CoverageWindowReport&{criticalCompetitions:string[];degradedCompetitions:string[]}>;
  bookmakers:{betanoRealPct:number;betssonRealPct:number;bothRealPct:number;proxyPct:number;neitherPct:number;stalePct:number;window:'7d'};
  quoteAges:QuoteAges;
  competitions:CompetitionReliability[];
  global:HealthIssue[];
  scheduler:{state:string;lastAutomaticInvocationAt:string|null;lastSuccessfulRefreshAt:string|null;nextDueAt:string|null;automationEnabled:boolean;lastError:string|null;lastJob:Record<string,unknown>|null};
  budget:BudgetGovernor|null;budgetVerified:boolean;
  catalog:{mapped:number;unmatched:number;ambiguous:number;ignored:number;disabled:number;rows:Array<{tournamentId:string;slug:string;name:string;category:string;state:string;competition:string|null;reason:string;futureFixtures:number|null;lastSeenAt:string}>};
  incidents:IncidentRecord[];recovery:RecoveryActionRecord[];
  alerting:{email:'CONFIGURED'|'NOT_CONFIGURED';dashboard:'ALWAYS'};
  liveOdds:typeof LIVE_ODDS_CAPABILITY;
}
const iso=(v:unknown)=>v instanceof Date?v.toISOString():typeof v==='string'?new Date(v).toISOString():null;
const optional=async(work:()=>Promise<{rows:Record<string,unknown>[]}>):Promise<{rows:Record<string,unknown>[]}>=>{try{return await work();}catch{return {rows:[]};}};

export async function readReliabilityHealth(db:QueryExecutor,now=new Date(),options:{automationEnabled?:boolean;emailConfigured?:boolean}={}):Promise<ReliabilityHealth>{
  const automationEnabled=options.automationEnabled??process.env.ODDS_AUTOMATION_ENABLED==='true';
  const [inputs,targets,snapshots,requests,ages,baselines,catalogRows,incidents,recovery,status,lastRequest,budget,lastJob]=await Promise.all([
    readCoverageInputs(db),
    db.query('SELECT bookmaker,tournament_id,last_success_at,last_attempt_at,retry_after,consecutive_failures,last_error FROM odds_refresh_targets'),
    // Latest applied snapshot per feed: what the provider actually returned, with near-term (3d) fixture/quote counts for that tournament.
    db.query(`WITH latest AS (SELECT DISTINCT ON (s.bookmaker,t.id) s.bookmaker,t.id AS tournament_id,s.observed_at,s.payload FROM odds_sync_snapshots s
        CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'tournamentIds') t(id) WHERE s.applied_at IS NOT NULL AND s.observed_at>now()-interval '3 days'
        ORDER BY s.bookmaker,t.id,s.observed_at DESC),
      near AS (SELECT l.bookmaker,l.tournament_id,f->>'providerId' AS provider_fixture_id FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.payload->'fixtures') f
        WHERE f->>'providerCompetitionId'=l.tournament_id AND (f->>'kickoff')::timestamptz BETWEEN now() AND now()+interval '3 days')
      SELECT l.bookmaker,l.tournament_id,l.observed_at,jsonb_array_length(l.payload->'fixtures')::int AS fixtures,jsonb_array_length(l.payload->'quotes')::int AS quotes,
        (SELECT count(*) FROM near n WHERE n.bookmaker=l.bookmaker AND n.tournament_id=l.tournament_id)::int AS near_fixtures,
        (SELECT count(*) FROM jsonb_array_elements(l.payload->'quotes') q WHERE q->>'providerFixtureId' IN (SELECT provider_fixture_id FROM near n WHERE n.bookmaker=l.bookmaker AND n.tournament_id=l.tournament_id))::int AS near_quotes
      FROM latest l`),
    db.query(`SELECT DISTINCT ON (safe_query->>'bookmaker',t.id) safe_query->>'bookmaker' AS bookmaker,t.id AS tournament_id,started_at,outcome,http_status
      FROM odds_provider_requests r CROSS JOIN LATERAL unnest(string_to_array(r.safe_query->>'tournamentIds',',')) t(id)
      WHERE r.endpoint='/v4/odds-by-tournaments' AND r.started_at>now()-interval '2 days' ORDER BY safe_query->>'bookmaker',t.id,started_at DESC`),
    db.query(`SELECT c.slug AS competition,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now()-o.observed_at))/60) FILTER (WHERE o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now()) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now()-o.observed_at))/60) FILTER (WHERE o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now()) AS p95,
        max(EXTRACT(EPOCH FROM (now()-o.observed_at))/60) FILTER (WHERE o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now()) AS oldest,
        count(*) FILTER (WHERE o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now())::int AS current_quotes,
        count(*) FILTER (WHERE o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>now() AND EXTRACT(EPOCH FROM (now()-o.observed_at))/60>=o.freshness_ttl_minutes*0.85)::int AS stale_quotes,
        count(*) FILTER (WHERE o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')<=now())::int AS expired_quotes
      FROM odds_current o JOIN fixtures f ON f.id=o.fixture_id JOIN competitions c ON c.id=f.competition_id
      WHERE o.status='ACTIVE' AND o.phase='PREGAME' AND o.freshness_ttl_minutes>0 AND f.status='SCHEDULED' AND f.kickoff>now() AND f.kickoff<=now()+interval '7 days' GROUP BY c.slug`),
    optional(()=>db.query(`SELECT DISTINCT ON (competition) competition,evaluated_at,fixtures_7d,any_7d,betano_7d,betsson_7d,proxy_7d FROM odds_health_rollups
      WHERE evaluated_at BETWEEN now()-interval '28 hours' AND now()-interval '20 hours' ORDER BY competition,evaluated_at DESC`)),
    optional(()=>db.query(`SELECT tournament_id,tournament_slug,tournament_name,category_slug,mapping_state,mapped_competition,mapping_reason,metadata,last_seen_at FROM odds_catalog_rows ORDER BY mapping_state,category_slug,tournament_slug`)),
    optional(()=>db.query(`SELECT * FROM odds_incidents WHERE state<>'RESOLVED' OR resolved_at>now()-interval '7 days' ORDER BY (state='RESOLVED'),severity DESC,opened_at DESC LIMIT 200`)),
    optional(()=>db.query(`SELECT * FROM odds_recovery_actions ORDER BY at DESC LIMIT 60`)),
    db.query('SELECT * FROM odds_scheduler_health WHERE id=true'),
    db.query('SELECT started_at,outcome,http_status FROM odds_provider_requests ORDER BY started_at DESC LIMIT 1'),
    budgetHealth(db),
    db.query(`SELECT started_at,completed_at,status,provider_requests,error_code,result FROM odds_sync_jobs WHERE trigger_source IN ('AUTOMATIC','CONTROLLED') ORDER BY started_at DESC LIMIT 1`),
  ]);
  const feedsByTournament=new Map<string,FeedEvidence[]>();
  for(const t of targets.rows){
    const id=String(t.tournament_id);const list=feedsByTournament.get(id)??[];
    const snap=snapshots.rows.find(s=>s.bookmaker===t.bookmaker&&String(s.tournament_id)===id);
    const req=requests.rows.find(r=>r.bookmaker===t.bookmaker&&String(r.tournament_id)===id);
    list.push({bookmaker:String(t.bookmaker),lastSuccessAt:iso(t.last_success_at),lastAttemptAt:iso(t.last_attempt_at),retryAfter:iso(t.retry_after),
      consecutiveFailures:Number(t.consecutive_failures??0),lastError:t.last_error?String(t.last_error):null,
      snapshot:snap?{observedAt:iso(snap.observed_at)!,returnedFixtures:Number(snap.fixtures),quotes:Number(snap.quotes),nearTermFixtures:Number(snap.near_fixtures),nearTermQuotes:Number(snap.near_quotes)}:null,
      request:req?{startedAt:iso(req.started_at)!,outcome:String(req.outcome),httpStatus:req.http_status===null?null:Number(req.http_status)}:null});
    feedsByTournament.set(id,list);
  }
  const catalogState=(competition:string,tournamentId:string|null):CatalogMappingState=>{
    if(tournamentId)return 'MAPPED';
    const rows=catalogRows.rows.filter(r=>r.mapped_competition===competition);
    if(rows.some(r=>r.mapping_state==='AMBIGUOUS'))return 'AMBIGUOUS';
    if(rows.some(r=>r.mapping_state==='DISABLED'))return 'DISABLED';
    return 'NONE';
  };
  const competitions:CompetitionReliability[]=inputs.map((input:CompetitionCoverageInput)=>{
    const a=ages.rows.find(r=>r.competition===input.competition);
    const b=baselines.rows.find(r=>r.competition===input.competition);
    const reliabilityInput:ReliabilityInput={...input,feeds:input.tournamentId?feedsByTournament.get(input.tournamentId)??[]:[],
      baseline:b?{evaluatedAt:iso(b.evaluated_at)!,fixtures7d:Number(b.fixtures_7d),any7d:Number(b.any_7d),betano7d:Number(b.betano_7d),betsson7d:Number(b.betsson_7d),proxy7d:Number(b.proxy_7d)}:null,
      catalogState:catalogState(input.competition,input.tournamentId),
      quoteAges:{p50Minutes:a?.p50===null||a===undefined?null:Math.round(Number(a.p50)),p95Minutes:a?.p95===null||a===undefined?null:Math.round(Number(a.p95)),oldestMinutes:a?.oldest===null||a===undefined?null:Math.round(Number(a.oldest)),
        currentQuotes:Number(a?.current_quotes??0),staleQuotes:Number(a?.stale_quotes??0),expiredQuotes:Number(a?.expired_quotes??0)}};
    const health=classifyCompetition(reliabilityInput,now);
    return {...health,windows:Object.fromEntries(COVERAGE_WINDOWS.map(k=>[k,reportWindow(input.windows[k])])) as Record<CoverageWindow,CoverageWindowReport>,feeds:reliabilityInput.feeds,baseline:reliabilityInput.baseline};
  }).sort((x,y)=>HEALTH_RANK[y.health]-HEALTH_RANK[x.health]||(Date.parse(x.nearestKickoff??'')||Infinity)-(Date.parse(y.nearestKickoff??'')||Infinity));
  const row=status.rows[0];
  const global=classifyGlobal({automationEnabled,lastAutomaticInvocationAt:iso(row?.last_automatic_invocation_at),
    lastRequest:lastRequest.rows[0]?{startedAt:iso(lastRequest.rows[0].started_at)!,outcome:String(lastRequest.rows[0].outcome),httpStatus:lastRequest.rows[0].http_status===null?null:Number(lastRequest.rows[0].http_status)}:null},now);
  const counts=Object.fromEntries(Object.keys(HEALTH_RANK).map(k=>[k,0])) as Record<HealthState,number>;for(const c of competitions)counts[c.health]++;
  const horizons=Object.fromEntries(COVERAGE_WINDOWS.map(k=>{
    const sum=emptyCounts();for(const i of inputs)for(const key of Object.keys(sum) as (keyof CoverageWindowCounts)[])sum[key]+=i.windows[k][key];
    const inWindow=competitions.filter(c=>c.windows[k].fixtures>0);
    return [k,{...reportWindow(sum),criticalCompetitions:inWindow.filter(c=>c.health==='CRITICAL'||c.health==='UNMAPPED').map(c=>c.competition),degradedCompetitions:inWindow.filter(c=>c.health==='DEGRADED'||c.health==='UNKNOWN').map(c=>c.competition)}];
  })) as ReliabilityHealth['horizons'];
  const seven=horizons['7d'];
  const allAges=ages.rows;
  const quoteAges:QuoteAges={p50Minutes:allAges.length?Math.round(allAges.reduce((n,r)=>n+Number(r.p50??0),0)/allAges.length):null,
    p95Minutes:allAges.length?Math.round(Math.max(...allAges.map(r=>Number(r.p95??0)))):null,oldestMinutes:allAges.length?Math.round(Math.max(...allAges.map(r=>Number(r.oldest??0)))):null,
    currentQuotes:allAges.reduce((n,r)=>n+Number(r.current_quotes),0),staleQuotes:allAges.reduce((n,r)=>n+Number(r.stale_quotes),0),expiredQuotes:allAges.reduce((n,r)=>n+Number(r.expired_quotes),0)};
  const fourSource=await readFourSourceHealth(db,now);
  if(fourSource.windows['7d'].degraded)global.push({classification:'PROXY_DOMINANT',severity:'WARNING',evidence:'Visible REAL feed coverage is degraded; hidden insurance must not mask it',affectedFixtures:fourSource.windows['7d'].fixtures});
  const overall=worstHealth([...competitions.map(c=>c.health),...global.map(g=>g.severity==='CRITICAL'?'CRITICAL' as const:'DEGRADED' as const)]);
  return {fourSource,version:HEALTH_CONTRACT_VERSION,generatedAt:now.toISOString(),overall:overall==='IDLE'&&competitions.length?'HEALTHY':overall,counts,horizons,
    bookmakers:{betanoRealPct:seven.betanoRealPct,betssonRealPct:seven.betssonRealPct,bothRealPct:seven.fixtures?Math.round(seven.bothReal/seven.fixtures*1000)/10:0,proxyPct:seven.proxyPct,neitherPct:seven.neitherPct,stalePct:seven.stalePct,window:'7d'},
    quoteAges,competitions,global,
    scheduler:{state:String(row?.state??'READY'),lastAutomaticInvocationAt:iso(row?.last_automatic_invocation_at),lastSuccessfulRefreshAt:iso(row?.last_refresh_at),nextDueAt:iso(row?.next_due_at),automationEnabled,lastError:row?.last_error?String(row.last_error):null,
      lastJob:lastJob.rows[0]?{startedAt:iso(lastJob.rows[0].started_at),completedAt:iso(lastJob.rows[0].completed_at),status:lastJob.rows[0].status,providerRequests:Number(lastJob.rows[0].provider_requests),errorCode:lastJob.rows[0].error_code,pacing:(lastJob.rows[0].result as Record<string,unknown>)?.pacing??null,integrity:(lastJob.rows[0].result as Record<string,unknown>)?.integrity??null}:null},
    budget:'governor' in budget?budget.governor as BudgetGovernor:null,budgetVerified:budget.verified===true,
    catalog:{mapped:catalogRows.rows.filter(r=>r.mapping_state==='MAPPED').length,unmatched:catalogRows.rows.filter(r=>r.mapping_state==='UNMATCHED').length,ambiguous:catalogRows.rows.filter(r=>r.mapping_state==='AMBIGUOUS').length,
      ignored:catalogRows.rows.filter(r=>r.mapping_state==='IGNORED_WITH_REASON').length,disabled:catalogRows.rows.filter(r=>r.mapping_state==='DISABLED').length,
      rows:catalogRows.rows.filter(r=>r.mapping_state==='UNMATCHED'||r.mapping_state==='AMBIGUOUS').map(r=>({tournamentId:String(r.tournament_id),slug:String(r.tournament_slug),name:String(r.tournament_name),category:String(r.category_slug),state:String(r.mapping_state),competition:r.mapped_competition?String(r.mapped_competition):null,reason:String(r.mapping_reason),futureFixtures:typeof (r.metadata as {futureFixtures?:unknown})?.futureFixtures==='number'?(r.metadata as {futureFixtures:number}).futureFixtures:null,lastSeenAt:iso(r.last_seen_at)!}))},
    incidents:incidents.rows.map(r=>({id:String(r.id),competition:String(r.competition),classification:String(r.classification),severity:r.severity as IncidentRecord['severity'],state:r.state as IncidentRecord['state'],openedAt:iso(r.opened_at)!,lastSeenAt:iso(r.last_seen_at)!,acknowledgedAt:iso(r.acknowledged_at),resolvedAt:iso(r.resolved_at),
      affectedFixtures:Number(r.affected_fixtures),recoveryAttempts:Number(r.recovery_attempts),detail:(r.detail as Record<string,unknown>)??{},resolution:r.resolution?String(r.resolution):null,alertSentAt:iso(r.alert_sent_at),alertSeverity:r.alert_severity?String(r.alert_severity):null,alertChannel:r.alert_channel?String(r.alert_channel):null})),
    recovery:recovery.rows.map(r=>({id:Number(r.id),at:iso(r.at)!,trigger:String(r.trigger_source),action:String(r.action),competition:r.competition?String(r.competition):null,bookmaker:r.bookmaker?String(r.bookmaker):null,tournamentId:r.tournament_id?String(r.tournament_id):null,
      reason:String(r.reason),requestCost:Number(r.request_cost),outcome:String(r.outcome),nextRetryAt:iso(r.next_retry_at),budgetRemainingAfter:r.budget_remaining_after===null?null:Number(r.budget_remaining_after),detail:(r.detail as Record<string,unknown>)??{}})),
    alerting:{email:(options.emailConfigured??alertEmailConfigured())?'CONFIGURED':'NOT_CONFIGURED',dashboard:'ALWAYS'},liveOdds:LIVE_ODDS_CAPABILITY};
}
export function alertEmailConfigured(env:NodeJS.ProcessEnv=process.env){
  return !!(env.OWNER_ALERT_EMAIL?.trim()&&env.AUTH_SMTP_HOST?.trim()&&env.AUTH_SMTP_USER?.trim()&&env.AUTH_SMTP_PASSWORD?.trim()&&env.AUTH_EMAIL_FROM?.trim());
}
