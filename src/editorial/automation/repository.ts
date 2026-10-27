import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {NewsDraft,NewsRecord,PublishedNews} from '../model';
import {usablePublishedNews} from '../presentation';
import {automationLimits as limits,automationSources,eventKey,fingerprint,stableFacts,factErrors,resultsFromSnapshot,publicationSlug,type EventFacts,type ResultFacts} from './policy';
import type {SportsSnapshot} from '@/multisport/model';
import type {ModelUsage} from './generation';
import type {ReviewEvidence} from './review';
import {primaryFeedDesks} from '../primary-feeds';
import {candidateDraft} from '../discovery';
import {generationEligible,newerCorroboration} from './eligibility';
import {canaryMatches,type CanaryScope} from './canary';
import {schedulerSlot,type SchedulerInvocation} from './scheduler';
/** A pristine discovery placeholder is not a human-written draft. Never overwrite it.
 * Preserve it privately; changed, reviewed, archived or previously published records block automation. */
export function pristineDiscoveryRecord(record:NewsRecord,facts:EventFacts):boolean{
  if(facts.kind!=='announcement'||record.revision!==1||record.published||record.archived||record.reviewedRevision||record.reviewedAt)return false;
  try{
    const language=facts.country==='international'?'en':'es';
    const expected=candidateDraft({desk:facts.sourceId,url:facts.sourceUrl,sourceDate:facts.eventDate.slice(0,10),headline:record.draft.title[language]});
    return isDeepStrictEqual(record.draft,expected);
  }catch{return false;}
}

export interface AutomationEvent {eventKey:string;facts:EventFacts;fingerprint:string;state:string;reason:string;revision:number;newsSlug:string|null;publicationRevision:number|null;attempts:number}
export interface SourceState {sourceId:string;disabled:boolean;nextAllowedAt:string;lastAttemptAt:string|null;lastSuccessAt:string|null;failures:number;cursor:Record<string,string>;lastStatus:string}
const eventColumns='event_key AS "eventKey",facts,fingerprint,state,reason,revision,news_slug AS "newsSlug",publication_revision AS "publicationRevision",attempts';
const sourceColumns='source_id AS "sourceId",disabled,next_allowed_at::text AS "nextAllowedAt",last_attempt_at::text AS "lastAttemptAt",last_success_at::text AS "lastSuccessAt",failures,cursor,last_status AS "lastStatus"';
const audit=(db:QueryExecutor,key:string|null,action:string,detail:object={})=>db.query('INSERT INTO editorial_automation_audit(event_key,action,detail) VALUES ($1,$2,$3)',[key,action,JSON.stringify(detail)]);
async function active(db:QueryExecutor,runId:string){
    const result=await db.query(`SELECT r.id FROM editorial_automation_runs r,editorial_automation_control c WHERE r.id=$1 AND r.status='running' AND r.lease_until>now() AND NOT c.paused AND (r.result->'canary' IS NULL OR (r.result->'canary'->>'expiresAt')::timestamptz>now())`,[runId]);
  if(!result.rows.length)throw Error('AUTOMATION_STOPPED_OR_LEASE_LOST');
}
export class AutomationRepository {
  constructor(readonly db:DatabaseClient,readonly canary?:CanaryScope){}
  async initialize(now=new Date()){await this.cleanupEvidence();for(const s of automationSources.filter(s=>!this.canary||s.id===this.canary.sourceId))await this.db.query('INSERT INTO editorial_discovery_state(source_id,disabled,next_allowed_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[s.id,!s.automaticAccess,now.toISOString()]);}
  async cleanupEvidence(){await this.db.query('DELETE FROM editorial_generation_evidence WHERE expires_at<=now()');}
  async saveEvidence(runId:string,key:string,checkpoint:number,payload:ReviewEvidence){
    if(!Number.isInteger(checkpoint)||checkpoint<0||checkpoint>12||Buffer.byteLength(JSON.stringify(payload))>90000)throw Error('PRIVATE_EVIDENCE_LIMIT');
    await this.db.query('INSERT INTO editorial_generation_evidence(run_id,event_key,checkpoint,payload) VALUES($1,$2,$3,$4) ON CONFLICT(run_id,event_key,checkpoint) DO NOTHING',[runId,key,checkpoint,JSON.stringify(payload)]);
  }
  async reviewEvidence(){await this.cleanupEvidence();return (await this.db.query<{run_id:string;event_key:string;checkpoint:number;payload:ReviewEvidence;expires_at:string}>('SELECT run_id,event_key,checkpoint,payload,expires_at::text FROM editorial_generation_evidence WHERE expires_at>now() ORDER BY created_at DESC,checkpoint DESC LIMIT 30')).rows;}
  async dashboard(){
    const [control,sources,events,runs,totals,alerts,invocations,leases,daily]=await Promise.all([
      this.db.query<{paused:boolean}>('SELECT paused FROM editorial_automation_control'),
      this.db.query<SourceState>(`SELECT ${sourceColumns} FROM editorial_discovery_state ORDER BY source_id`),
      this.db.query<AutomationEvent>(`SELECT ${eventColumns} FROM editorial_automation_events ORDER BY changed_at DESC LIMIT 100`),
      this.db.query('SELECT id,started_at,finished_at,status,requests_reserved,requests_used,model_microusd_reserved,model_microusd_used,input_tokens,output_tokens,result FROM editorial_automation_runs ORDER BY started_at DESC LIMIT 12'),
      this.db.query(`SELECT coalesce(sum(requests_used) FILTER (WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::int AS "requestsToday",coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)) FILTER (WHERE started_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::int AS "monthReservedMicroUsd",coalesce(sum(model_microusd_used),0)::int AS "recordedMicroUsd",coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0)::int AS "lifetimeReservedMicroUsd" FROM editorial_automation_runs`),
      this.db.query("SELECT action,detail,recorded_at FROM editorial_automation_audit WHERE action IN ('budget-blocked','model-circuit-breaker','unexpected-model-usage') ORDER BY recorded_at DESC LIMIT 10"),
      this.db.query<{detail:SchedulerInvocation}>("SELECT detail FROM editorial_automation_audit WHERE action='scheduler-invocation' AND recorded_at>=now()-interval '7 days' ORDER BY recorded_at DESC LIMIT 128"),
      this.db.query<{active:number;expired:number}>("SELECT count(*) FILTER(WHERE lease_until>now())::int AS active,count(*) FILTER(WHERE lease_until<=now())::int AS expired FROM editorial_automation_runs WHERE status='running'"),
      this.db.query<{published:number;review:number;skipped:number;completed:number;failed:number;modelMicroUsd:number}>(`WITH boundary AS (SELECT date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day)
        SELECT (SELECT count(*)::int FROM editorial_automation_audit,boundary WHERE action='auto-publish' AND recorded_at>=day) AS published,
        (SELECT count(*)::int FROM editorial_automation_events,boundary WHERE state='review' AND changed_at>=day) AS review,
        (SELECT count(*)::int FROM editorial_automation_audit,boundary WHERE action='scheduler-invocation' AND detail->>'outcome'='no-op' AND recorded_at>=day) AS skipped,
        count(*) FILTER(WHERE status='completed')::int AS completed,count(*) FILTER(WHERE status='failed')::int AS failed,
        coalesce(sum(model_microusd_used),0)::int AS "modelMicroUsd" FROM editorial_automation_runs,boundary WHERE started_at>=day`),
    ]);
    return {observedAt:new Date().toISOString(),paused:control.rows[0]?.paused??true,sources:sources.rows,events:events.rows,runs:runs.rows,usage:totals.rows[0],daily:daily.rows[0],alerts:alerts.rows,invocations:invocations.rows.map(x=>x.detail),leases:leases.rows[0],limits,registry:automationSources};
  }
  async control(input:{paused?:boolean;sourceId?:string;disabled?:boolean}){
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724222)');
      if(typeof input.paused==='boolean')await db.query('UPDATE editorial_automation_control SET paused=$1,edited_at=now()',[input.paused]);
      if(input.sourceId){const source=automationSources.find(s=>s.id===input.sourceId);if(!source||typeof input.disabled!=='boolean')throw Error('INVALID_CONTROL');if(!input.disabled&&!source.automaticAccess)throw Error('SOURCE_PERMISSION_REQUIRED');await db.query('INSERT INTO editorial_discovery_state(source_id,disabled) VALUES ($1,$2) ON CONFLICT(source_id) DO UPDATE SET disabled=$2',[input.sourceId,input.disabled]);}
      await audit(db,null,'owner-control',input);
    });
  }
  /** Reservation survives crashes, overlapping invocations and restarts. No model calls before commit. */
  async claim(modelEnabled:boolean,validationOnly:boolean,now=new Date()):Promise<{id:string}|{reason:string}>{
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724222)');
      if((await db.query<{paused:boolean}>('SELECT paused FROM editorial_automation_control FOR UPDATE')).rows[0]?.paused!==false)return {reason:'paused'};
      if(this.canary){
        if(!modelEnabled)return {reason:'canary-model-disabled'};
        if(+now<Date.parse(this.canary.notBefore))return {reason:'canary-not-due'};
        if(Date.parse(this.canary.expiresAt)<=+now)return {reason:'canary-expired'};
        const consumed=await db.query("SELECT id FROM editorial_automation_audit WHERE action='canary-claimed' AND (detail->>'id'=$1 OR detail->>'eventKey'=$2) LIMIT 1",[this.canary.id,this.canary.eventKey]);
        if(consumed.rows.length)return {reason:'canary-consumed'};
      }
      // Recurring production gets one claim per real UTC cron slot. Arrival-time jitter
      // must not turn a six-hour scheduler into a twelve-hour scheduler. Validation
      // and one-event canaries retain their stricter elapsed-time gate.
      const recurring=!validationOnly&&!this.canary;
      const dueBoundary=recurring?schedulerSlot(now).scheduledAt:new Date(+now-limits.minIntervalMs).toISOString();
      const recent=await db.query(`SELECT id FROM editorial_automation_runs WHERE started_at${recurring?'>=':'>'}$1 OR (status='running' AND lease_until>now()) LIMIT 1`,[dueBoundary]);
      if(recent.rows.length)return {reason:'not-due'};
      const totals=(await db.query<{dayCount:number;dayRequests:number;dayCost:number;monthCost:number;allCost:number}>(`SELECT count(*) FILTER(WHERE started_at>=$1)::int AS "dayCount",coalesce(sum(requests_reserved) FILTER(WHERE started_at>=$1),0)::int AS "dayRequests",coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)) FILTER(WHERE started_at>=$1),0)::int AS "dayCost",coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)) FILTER(WHERE started_at>=$2),0)::int AS "monthCost",coalesce(sum(greatest(model_microusd_reserved,model_microusd_used)),0)::int AS "allCost" FROM editorial_automation_runs`,[now.toISOString().slice(0,10)+'T00:00:00Z',now.toISOString().slice(0,7)+'-01T00:00:00Z'])).rows[0];
      const reserve=modelEnabled?limits.reserveMicroUsd:0;
      if(totals.dayCount>=limits.maxRunsPerDay||totals.dayRequests+4>limits.maxRequestsPerDay)return {reason:'discovery-budget'};
      if(totals.dayCost+reserve>limits.maxDailyMicroUsd||totals.monthCost+reserve>limits.maxMonthlyMicroUsd||(validationOnly&&totals.allCost+reserve+(this.canary?.priorReservedMicroUsd??0)>limits.maxValidationMicroUsd)){
        await db.query("INSERT INTO editorial_automation_audit(action,detail) SELECT 'budget-blocked',$1 WHERE NOT EXISTS (SELECT 1 FROM editorial_automation_audit WHERE action='budget-blocked' AND recorded_at>=now()-interval '24 hours')",[JSON.stringify({validationOnly,reason:'PRE_CALL_HARD_STOP'})]);
        return {reason:'model-budget'};
      }
      await db.query("UPDATE editorial_automation_runs SET status='abandoned' WHERE status='running' AND lease_until<=now()");
      const id=randomUUID();await db.query("INSERT INTO editorial_automation_runs(id,started_at,lease_until,status,requests_reserved,model_microusd_reserved) VALUES ($1,$2,$3,'running',4,$4)",[id,now.toISOString(),new Date(+now+180000).toISOString(),reserve]);
      if(this.canary){await db.query('UPDATE editorial_automation_runs SET result=$2 WHERE id=$1',[id,JSON.stringify({canary:this.canary})]);await audit(db,null,'canary-claimed',{...this.canary,runId:id});}
      return {id};
    });
  }
  async sourceEnabled(id:string){return (!this.canary||this.canary.sourceId===id)&&automationSources.some(s=>s.id===id&&s.automaticAccess)&&(await this.db.query<{disabled:boolean}>('SELECT disabled FROM editorial_discovery_state WHERE source_id=$1',[id])).rows[0]?.disabled===false;}
  async dueSources(now=new Date()){return (await this.db.query<SourceState>(`SELECT ${sourceColumns} FROM editorial_discovery_state WHERE NOT disabled AND source_id=ANY($2::text[]) AND next_allowed_at<=$1 ORDER BY CASE WHEN source_id=ANY($3::text[]) THEN 0 ELSE 1 END,last_attempt_at NULLS FIRST,source_id LIMIT 2`,[now.toISOString(),automationSources.filter(s=>s.automaticAccess&&s.id!=='openliga-results'&&(!this.canary||s.id===this.canary.sourceId)).map(s=>s.id),primaryFeedDesks.map(s=>s.id)])).rows;}
  async finishSource(runId:string,id:string,status:string,requests:number,cursor:Record<string,string>,now=new Date()){
    await this.db.transaction(async db=>{
      await active(db,runId);
      const ok=['CANDIDATES_REQUIRE_REVIEW','NO_CURRENT_VERIFIED_CANDIDATES','NOT_MODIFIED','RESULTS_VALIDATED'].includes(status);
      const row=(await db.query<{failures:number}>('SELECT failures FROM editorial_discovery_state WHERE source_id=$1 FOR UPDATE',[id])).rows[0];
      // Empty supplementary Wikinews categories must not consume the daily primary-source slots.
      const failures=ok?0:Math.min(8,(row?.failures??0)+1),hours=ok?(id.startsWith('wikinews-')&&status==='NO_CURRENT_VERIFIED_CANDIDATES'?168:24):Math.min(168,6*2**failures);
      await db.query('UPDATE editorial_discovery_state SET last_attempt_at=$2,last_success_at=CASE WHEN $3 THEN $2 ELSE last_success_at END,next_allowed_at=$4,failures=$5,last_status=$6,cursor=$7 WHERE source_id=$1',[id,now.toISOString(),ok,new Date(+now+hours*3600000).toISOString(),failures,status,JSON.stringify(cursor)]);
      await db.query('UPDATE editorial_automation_runs SET requests_used=requests_used+$2 WHERE id=$1',[runId,requests]);
    });
  }
  async observe(runId:string,facts:EventFacts,now=new Date()):Promise<'new'|'unchanged'|'changed'|'queue-full'>{
    if(this.canary&&!canaryMatches(this.canary,facts))return 'unchanged';
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724219)');await active(db,runId);
      const key=eventKey(facts),hash=fingerprint(stableFacts(facts)),source=facts.kind!=='metadata'?facts.sourceId:facts.candidate.desk,url=facts.kind!=='metadata'?facts.sourceUrl:facts.candidate.url;
      if((await db.query<{disabled:boolean}>('SELECT disabled FROM editorial_discovery_state WHERE source_id=$1',[source])).rows[0]?.disabled!==false)return 'unchanged';
      const old=(await db.query<AutomationEvent>(`SELECT ${eventColumns} FROM editorial_automation_events WHERE event_key=$1 FOR UPDATE`,[key])).rows[0];
      if(old?.fingerprint===hash){
        if(newerCorroboration(old.facts,facts,now))await db.query('UPDATE editorial_automation_events SET facts=$2 WHERE event_key=$1',[key,JSON.stringify(facts)]);
        return 'unchanged';
      }
      // Upgrade a never-generated metadata placeholder, not a correction of published facts.
      if(old?.facts.kind==='metadata'&&facts.kind==='announcement'&&!old.newsSlug&&old.attempts===0&&!factErrors(facts,now).length){
        await db.query("UPDATE editorial_automation_events SET facts=$2,fingerprint=$3,revision=revision+1,state='pending',reason='PRIMARY_FACTS_VERIFIED',changed_at=$4 WHERE event_key=$1",[key,JSON.stringify(facts),hash,now.toISOString()]);
        await audit(db,key,'primary-facts-verified');return 'new';
      }
      const errors=factErrors(facts,now),state=errors.length?'review':'pending',reason=errors[0]??'AWAITING_GENERATION';
      if(!old){
        const count=(await db.query<{count:string}>("SELECT count(*) FROM editorial_automation_events WHERE state NOT IN ('published','withdrawn')")).rows[0].count;
        if(Number(count)>=limits.maxPending)return 'queue-full';
        await db.query('INSERT INTO editorial_automation_events(event_key,source_id,source_url,fingerprint,facts,state,reason,discovered_at,changed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)',[key,source,url,hash,JSON.stringify(facts),state,reason,now.toISOString()]);
        await audit(db,key,'discovered',{policy:reason});return 'new';
      }
      // Changed source facts withdraw only this job's unchanged publication; never overwrite Owner edits.
      await this.withdraw(db,old,'source-correction',now);
      await db.query("UPDATE editorial_automation_events SET facts=$2,fingerprint=$3,revision=revision+1,state='review',reason='SOURCE_CHANGED_REVIEW_REQUIRED',changed_at=$4 WHERE event_key=$1",[key,JSON.stringify(facts),hash,now.toISOString()]);
      await audit(db,key,'source-changed',{previousFingerprint:old.fingerprint,fingerprint:hash});return 'changed';
    });
  }
  private async withdraw(db:QueryExecutor,event:AutomationEvent,reason:string,now:Date){
    if(!event.newsSlug)return;
    const row=(await db.query<NewsRecord>('SELECT slug,draft,published,revision,archived FROM editorial_news WHERE slug=$1 FOR UPDATE',[event.newsSlug])).rows[0];
    // Source uncertainty removes the old public claim even when the Owner has a newer private draft.
    // Preserve that draft and all versions; never republish over a manual intervention.
    if(row&&!row.archived&&row.published){
      await db.query('UPDATE editorial_news SET archived=true,revision=revision+1,reviewed_revision=NULL,reviewed_at=NULL,edited_at=$2 WHERE slug=$1',[row.slug,now.toISOString()]);
      await db.query("INSERT INTO editorial_news_audit(slug,action,revision,snapshot) VALUES ($1,'archive',$2,$3)",[row.slug,row.revision+1,JSON.stringify({...row,archived:true,revision:row.revision+1})]);
      await audit(db,event.eventKey,reason,{slug:row.slug,previousRevision:row.revision});
    }
  }
  /** A result removed/reopened in a successfully validated snapshot is no longer safe to report. */
  async reconcile(runId:string,validKeys:Set<string>,now=new Date()){
    // A one-story canary must not withdraw or reconcile unrelated existing publications.
    if(this.canary)return 0;
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724219)');await active(db,runId);
      const events=(await db.query<AutomationEvent>(`SELECT ${eventColumns} FROM editorial_automation_events WHERE source_id='openliga-results' AND state IN ('published','pending') FOR UPDATE`)).rows;
      let withdrawn=0;
      for(const event of events){if(validKeys.has(event.eventKey))continue;await this.withdraw(db,event,'source-withdrawal',now);await db.query("UPDATE editorial_automation_events SET state='withdrawn',reason='SOURCE_WITHDRAWN_OR_OUTSIDE_FRESH_WINDOW',changed_at=$2 WHERE event_key=$1",[event.eventKey,now.toISOString()]);withdrawn++;}
      return withdrawn;
    });
  }
  async pending(){return (await this.db.query<AutomationEvent>(`SELECT ${eventColumns} FROM editorial_automation_events e JOIN editorial_discovery_state s ON s.source_id=e.source_id WHERE NOT s.disabled AND attempts<3 AND (state='pending' OR (state='generation-failed' AND reason IN ('GENERATION_IN_PROGRESS','MODEL_RATE_LIMITED','MODEL_UNAVAILABLE','MODEL_FAILED_NO_RETRY') AND changed_at <= now() - make_interval(hours => 6 * (1 << greatest(attempts-1,0))))) ORDER BY facts->>'eventDate' DESC NULLS LAST,event_key LIMIT 1`)).rows[0]??null;}
  /** Bound by maxPending. Stale/unsupported queue heads must not starve eligible
   * stories or spend model calls. Keep them private for future corroboration. */
  async eligiblePending(now=new Date(),resultsValidated=true){
    const rows=(await this.db.query<AutomationEvent>(`SELECT ${eventColumns} FROM editorial_automation_events e JOIN editorial_discovery_state s ON s.source_id=e.source_id WHERE NOT s.disabled AND attempts<3 AND (state='pending' OR (state='generation-failed' AND reason IN ('GENERATION_IN_PROGRESS','MODEL_RATE_LIMITED','MODEL_UNAVAILABLE','MODEL_FAILED_NO_RETRY') AND changed_at <= now() - make_interval(hours => 6 * (1 << greatest(attempts-1,0))))) ORDER BY facts->>'eventDate' DESC NULLS LAST,event_key LIMIT $1`,[limits.maxPending])).rows;
    return rows.find(row=>(!this.canary||(row.attempts===0&&canaryMatches(this.canary,row.facts)))&&generationEligible(row.facts,now,resultsValidated))??null;
  }
  async markAttempt(runId:string,key:string){await this.db.transaction(async db=>{await active(db,runId);await db.query("UPDATE editorial_automation_events SET attempts=attempts+1,state='generation-failed',reason='GENERATION_IN_PROGRESS',changed_at=now() WHERE event_key=$1 AND state IN ('pending','generation-failed') AND attempts<3",[key]);});}
  /** Read-only early check saves model spend. The transaction repeats it at publish
   * time, since Owner edits can race generation. Archived Owner work stays protected. */
  async publicationBlocker(event:AutomationEvent):Promise<string|null>{
    if(event.facts.kind==='metadata')return 'PUBLICATION_CONFLICT';
    const slug=publicationSlug(event.facts);
    const rows=(await this.db.query<NewsRecord>('SELECT slug,draft,published,revision,reviewed_revision AS "reviewedRevision",reviewed_at AS "reviewedAt",archived FROM editorial_news WHERE slug=$1 OR draft->>\'sourceUrl\'=$2 OR published->>\'sourceUrl\'=$2',[slug,event.facts.sourceUrl])).rows;
    return rows.some(row=>row.slug===slug||!pristineDiscoveryRecord(row,event.facts))?'OWNER_OR_DUPLICATE_RECORD':null;
  }
  async assertActive(runId:string){await active(this.db,runId);}
  async fail(key:string,reason:string){
    const retry=['MODEL_RATE_LIMITED','MODEL_UNAVAILABLE','MODEL_FAILED_NO_RETRY'].includes(reason);
    await this.db.query("UPDATE editorial_automation_events SET state=CASE WHEN $3 AND attempts<3 THEN 'generation-failed' ELSE 'review' END,reason=$2,changed_at=now() WHERE event_key=$1 AND state IN ('pending','generation-failed')",[key,reason.slice(0,120),retry]);
    if(['MODEL_AUTH_REJECTED','MODEL_CONFIGURATION_REJECTED','MODEL_QUOTA_EXCEEDED','MODEL_LIMIT_UNCLASSIFIED'].includes(reason))await this.db.transaction(async db=>{await db.query('UPDATE editorial_automation_control SET paused=true,edited_at=now()');await audit(db,key,'model-circuit-breaker',{reason});});
  }
  async publish(runId:string,event:AutomationEvent,draft:NewsDraft,now=new Date()){
    if(this.canary&&!canaryMatches(this.canary,event.facts))throw Error('PUBLICATION_CONFLICT');
    const stamp=now.toISOString(),published:PublishedNews={...draft,publishedAt:stamp,updatedAt:stamp,verifiedAt:stamp};
    // Never persist a "published" record that the public language/metadata gate rejects.
    // Callers must use the same clock sample for toNewsDraft and publish; do not restamp audit evidence.
    if(!usablePublishedNews(published,now))throw Error('PUBLICATION_PRESENTATION_INVALID');
    return this.db.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(724219)');await active(db,runId);
      const stored=(await db.query<AutomationEvent>(`SELECT ${eventColumns} FROM editorial_automation_events WHERE event_key=$1 FOR UPDATE`,[event.eventKey])).rows[0];
      if(!stored||stored.fingerprint!==event.fingerprint||stored.state!=='generation-failed'||stored.newsSlug||!generationEligible(stored.facts,now))throw Error('PUBLICATION_CONFLICT');
      if((await db.query<{disabled:boolean}>('SELECT disabled FROM editorial_discovery_state WHERE source_id=$1',[ (stored.facts as ResultFacts).sourceId])).rows[0]?.disabled!==false)throw Error('SOURCE_DISABLED');
      const facts=stored.facts;
      if(facts.kind==='metadata')throw Error('PUBLICATION_CONFLICT');
      if(facts.kind==='result'){
      const snapshot=(await db.query<{published:SportsSnapshot}>("SELECT published FROM sports_snapshots WHERE competition_id=$1 AND season=$2 AND NOT archived AND published IS NOT NULL FOR SHARE",[facts.competition,facts.season])).rows[0]?.published;
      if(!snapshot||!resultsFromSnapshot(snapshot,now).some(f=>f.eventKey===facts.eventKey&&fingerprint(stableFacts(f))===stored.fingerprint))throw Error('SOURCE_CHANGED_DURING_GENERATION');
      }
      const duplicates=(await db.query<NewsRecord>('SELECT slug,draft,published,revision,reviewed_revision AS "reviewedRevision",reviewed_at AS "reviewedAt",archived FROM editorial_news WHERE slug=$1 OR draft->>\'sourceUrl\'=$2 OR published->>\'sourceUrl\'=$2 FOR UPDATE',[draft.slug,draft.sourceUrl])).rows;
      if(duplicates.some(row=>row.slug===draft.slug||!pristineDiscoveryRecord(row,facts)))throw Error('OWNER_OR_DUPLICATE_RECORD');
      const record:NewsRecord={slug:draft.slug,draft,published,revision:1,reviewedRevision:null,reviewedAt:null,archived:false};
      // No forged human review stamp. Machine policy provenance lives in the separate audit table.
      await db.query('INSERT INTO editorial_news(slug,draft,published) VALUES ($1,$2,$3)',[draft.slug,JSON.stringify(draft),JSON.stringify(published)]);
      await db.query("INSERT INTO editorial_news_audit(slug,action,revision,snapshot) VALUES ($1,'publish',1,$2)",[draft.slug,JSON.stringify(record)]);
      await db.query("UPDATE editorial_automation_events SET state='published',reason=$4,news_slug=$2,publication_revision=1,changed_at=$3 WHERE event_key=$1",[event.eventKey,draft.slug,stamp,facts.kind==='announcement'?'PRIMARY_ANNOUNCEMENT_POLICY_V1':'STRUCTURED_RESULT_POLICY_V1']);
      await audit(db,event.eventKey,'auto-publish',{runId,policy:facts.kind==='announcement'?'primary-announcement-v1':'structured-result-v1',modelAudit:'passed',deterministicChecks:'passed',translationMode:'model-generated-and-audited',snapshotHash:facts.kind==='announcement'?facts.provenance.factsHash:facts.sourceSnapshotHash});
      return draft.slug;
    });
  }
  async finish(runId:string,result:object,usage:ModelUsage,status:'completed'|'failed'='completed'){
    // Keep the original worst-case reservation, including ambiguous network failures. Never refund it.
    await this.db.query('UPDATE editorial_automation_runs SET status=$2,finished_at=now(),model_microusd_used=$3,input_tokens=$4,output_tokens=$5,result=result||$6::jsonb WHERE id=$1 AND status=\'running\'',[runId,status,usage.microUsd,usage.inputTokens,usage.outputTokens,JSON.stringify({...result,modelUsage:{calls:usage.calls,stages:usage.stages??{},...(usage.failure?{failure:usage.failure}:{}),...(usage.audit?{audit:usage.audit}:{})}})]);
    if(usage.microUsd>limits.reserveMicroUsd)await this.db.transaction(async db=>{await db.query('UPDATE editorial_automation_control SET paused=true,edited_at=now()');await audit(db,null,'unexpected-model-usage',{runId,reportedMicroUsd:usage.microUsd});});
  }
}
