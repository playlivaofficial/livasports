import {SportsRepository} from '@/multisport/repository';
import {assertOpenLigaSnapshot} from '@/multisport/openligadb';
import {collectDiscovery} from '../discovery-collector';
import {collectWikinews} from '../wikinews-discovery';
import {discoveryDesks} from '../discovery';
import {AutomationRepository,type SourceState} from './repository';
import {generateBriefing,type ModelUsage} from './generation';
import {resultsFromSnapshot,toNewsDraft,factErrors,automationSources,eventKey,type EventFacts} from './policy';
import type {AnnouncementFacts} from './announcements';
import {canaryMatches} from './canary';
import {eventKey} from './policy';

/** Cache validators apply to a fixed, approved index only. Never persist raw article bodies. */
export async function collectScheduledDiscovery(source:SourceState,fetcher:typeof fetch=fetch,now=new Date()){
  if(source.sourceId.startsWith('wikinews-'))return {...await collectWikinews(source.sourceId,fetcher,now),cursor:{}};
  const desk=discoveryDesks.find(d=>d.id===source.sourceId);if(!desk)throw Error('SOURCE_NOT_APPROVED');
  let unchanged=false;const cursor={...source.cursor};
  const contractChanged=source.sourceId==='nba-releases'&&cursor.contract!=='nba-audience-v1';
  const conditional:typeof fetch=async(input,init)=>{
    const headers=new Headers(init?.headers);
    if(String(input)===desk.url&&source.sourceId!=='dimayor-releases'&&!contractChanged){if(cursor.etag)headers.set('If-None-Match',cursor.etag);if(cursor.modified)headers.set('If-Modified-Since',cursor.modified);}
    const response=await fetcher(input,{...init,headers});
    if(String(input)===desk.url){
      if(response.status===304){unchanged=true;return new Response(' ',{status:200});}
      if(response.ok){if(source.sourceId==='nba-releases')cursor.contract='nba-audience-v1';for(const [key,header] of [['etag','etag'],['modified','last-modified']]){const value=response.headers.get(header);if(value&&value.length<256&&!/[\r\n]/.test(value))cursor[key]=value;else delete cursor[key];}}
    }
    return response;
  };
  const result=await collectDiscovery(source.sourceId,conditional,now);
  return {...result,status:unchanged?'NOT_MODIFIED':result.status,cursor};
}
export async function runNewsAutomation(repo:AutomationRepository,options:{key?:string;validationOnly:boolean;fetcher?:typeof fetch;now?:Date}){
  const now=options.now??new Date(),usage:ModelUsage={calls:0,inputTokens:0,outputTokens:0,microUsd:0};
  await repo.initialize(now);
  const claim=await repo.claim(!!options.key?.trim(),options.validationOnly,now);
  if(!('id' in claim))return {status:claim.reason,requests:0,published:[],changed:false};
  const runId=claim.id;
  const result={runId,status:'completed',requests:0,discovered:0,corrections:0,withdrawn:0,published:[] as string[],changed:false,generation:options.key?'no-eligible-event':'MODEL_CREDENTIAL_MISSING',validatorRecovery:null as {correctionId:string;recovered:boolean}|null,candidates:{seen:0,outsideAuthorization:0,unchanged:0,reviewRequired:0,queueFull:0,selected:0,ownerOrDuplicateBlocked:0},sourceOutcomes:[] as {sourceId:string;status:string;requests:number}[]};
  async function observe(facts:EventFacts){
    result.candidates.seen++;
    if(repo.canary&&!canaryMatches(repo.canary,facts)){result.candidates.outsideAuthorization++;return;}
    if(factErrors(facts,now).length)result.candidates.reviewRequired++;
    const state=await repo.observe(runId,facts,now);
    if(state==='new')result.discovered++;if(state==='changed')result.corrections++;
    if(state==='unchanged')result.candidates.unchanged++;if(state==='queue-full')result.candidates.queueFull++;
  }
  async function sourceResult(id:string,status:string,requests:number,cursor:Record<string,string>={}){
    result.sourceOutcomes.push({sourceId:id,status:/^[A-Z0-9_]{1,80}$/.test(status)?status:'SOURCE_STATUS_UNKNOWN',requests});
    await repo.finishSource(runId,id,status,requests,cursor,now);
  }
  let publishingEvent:string|null=null;
  try{
    let resultsValidated=false;
    if(await repo.sourceEnabled('openliga-results')){
      try{
      const snapshot=await new SportsRepository(repo.db).findPublished('bundesliga');
      // A storage/source failure is NOT a retraction. Only a validated replacement can retract.
      if(snapshot){
        assertOpenLigaSnapshot(snapshot,now);
        const facts=resultsFromSnapshot(snapshot,now);
        for(const item of facts)await observe(item);
        const completedKeys=new Set(snapshot.events.filter(e=>e.status==='completed').map(e=>`bundesliga:${snapshot.season}:${e.id}`));
        result.withdrawn=await repo.reconcile(claim.id,completedKeys,now);
        resultsValidated=true;
        await sourceResult('openliga-results','RESULTS_VALIDATED',0);
      }else await sourceResult('openliga-results','RESULT_SNAPSHOT_UNAVAILABLE',0);
      }catch{await sourceResult('openliga-results','RESULT_VALIDATION_FAILED',0);}
    }
    const recovery=options.key&&!repo.canary?await repo.beginValidatorRecovery(runId,now):null;
    const due=await repo.dueSources(now);
    const sources=recovery?[recovery.source,...due.filter(s=>s.sourceId!==recovery.source.sourceId)]:due;
    for(const source of sources){
      // An attachment-backed source can cost four reads. Never exceed the four reads reserved by claim.
      const requestLimit=automationSources.find(s=>s.id===source.sourceId)?.requestLimit;
      if(requestLimit===undefined||result.requests+requestLimit>4)continue;
      if(!await repo.sourceEnabled(source.sourceId))continue;
      let found:Awaited<ReturnType<typeof collectScheduledDiscovery>>;
      try{found=await collectScheduledDiscovery(source,options.fetcher,now);}
      catch{
        // Charge the maximum if a collector fails before returning its counter.
        // Other sources' verified candidates remain eligible for this cycle.
        result.requests+=requestLimit;
        await sourceResult(source.sourceId,'SOURCE_COLLECTOR_FAILED',requestLimit,source.cursor);
        if(recovery?.source.sourceId===source.sourceId)result.validatorRecovery={correctionId:recovery.ticket.correctionId,recovered:await repo.finishValidatorRecovery(runId,recovery.ticket,undefined,now)};
        continue;
      }
      result.requests+=found.requests;
      await sourceResult(source.sourceId,found.status,found.requests,found.cursor);
      const announcements:AnnouncementFacts[]='announcements' in found&&Array.isArray(found.announcements)?found.announcements:[];
      for(const candidate of found.candidates)await observe(announcements.find(f=>f.sourceUrl===candidate.url)??{kind:'metadata' as const,candidate,...('reviewReasons' in found&&(found.reviewReasons as Record<string,string>)[candidate.url]&&['SCHEDULE_ATTACHMENT_REVIEW_REQUIRED','PRIMARY_ARTICLE_REVIEW_REQUIRED'].includes((found.reviewReasons as Record<string,string>)[candidate.url])?{reason:(found.reviewReasons as Record<string,'SCHEDULE_ATTACHMENT_REVIEW_REQUIRED'|'PRIMARY_ARTICLE_REVIEW_REQUIRED'>)[candidate.url]}:{})});
      if(recovery?.source.sourceId===source.sourceId)result.validatorRecovery={correctionId:recovery.ticket.correctionId,recovered:await repo.finishValidatorRecovery(runId,recovery.ticket,announcements.find(f=>eventKey(f)===recovery.ticket.eventKey),now)};
    }
    const event=await repo.eligiblePending(now,resultsValidated);
    result.candidates.selected=event?1:0;
    if(event&&options.key&&(event.facts.kind==='announcement'||(event.facts.kind==='result'&&resultsValidated))){
      const blocker=await repo.publicationBlocker(event);
      if(blocker){result.generation=blocker;if(blocker==='OWNER_OR_DUPLICATE_RECORD')result.candidates.ownerOrDuplicateBlocked++;await repo.fail(event.eventKey,blocker);}
      else if(factErrors(event.facts,now).length){result.generation='FACTS_NO_LONGER_ELIGIBLE';await repo.fail(event.eventKey,result.generation);}
      else{
        await repo.markAttempt(claim.id,event.eventKey);
        let checkpoint=0;
        const generated=await generateBriefing(event.facts,options.key,options.fetcher,()=>repo.assertActive(claim.id),e=>repo.saveEvidence(claim.id,event.eventKey,checkpoint++,e));Object.assign(usage,generated.usage);result.generation=generated.status;
        if(generated.copy){publishingEvent=event.eventKey;const draft=toNewsDraft(generated.copy,event.facts,now);result.published.push(await repo.publish(claim.id,event,draft,now));publishingEvent=null;}
        else{await repo.fail(event.eventKey,generated.status);if(generated.status.startsWith('MODEL_'))result.status='failed';}
      }
    }
    result.changed=!!(result.corrections||result.withdrawn||result.published.length);
    await repo.finish(claim.id,result,usage,result.status==='failed'?'failed':'completed');return result;
  }catch(error){
    // Intentionally no raw exception, URL, SQL or API response in logs/HTTP/audit.
    if(publishingEvent){
      const allowed=['OWNER_OR_DUPLICATE_RECORD','PUBLICATION_CONFLICT','SOURCE_DISABLED','SOURCE_CHANGED_DURING_GENERATION','PUBLICATION_PRESENTATION_INVALID','PUBLICATION_POLICY_FAILED','AUTOMATION_STOPPED_OR_LEASE_LOST'];
      const code=error instanceof Error&&allowed.includes(error.message)?error.message:'PUBLICATION_STORAGE_UNAVAILABLE';
      result.generation=code;await repo.fail(publishingEvent,code);
    }
    result.status='failed';result.changed=!!(result.corrections||result.withdrawn||result.published.length);
    await repo.finish(claim.id,result,usage,'failed');return result;
  }finally{if(repo.canary)await repo.control({paused:true});}
}
