import {primaryReviewReasons,type PrimaryReviewReason} from '../primary-verification';
import {selectDueSources} from './source-timing';
import {SportsRepository} from '@/multisport/repository';
import {assertOpenLigaSnapshot} from '@/multisport/openligadb';
import {collectDiscovery} from '../discovery-collector';
import {collectWikinews} from '../wikinews-discovery';
import {discoveryDesks} from '../discovery';
import {AutomationRepository,type SourceState} from './repository';
import {generateBriefing,modelPolicy,type ModelUsage} from './generation';
import {automationLimits,resultsFromSnapshot,toNewsDraft,factErrors,automationSources,eventKey,type EventFacts} from './policy';
import type {AnnouncementFacts} from './announcements';
import {canaryMatches} from './canary';

/** Cache validators apply to a fixed, approved index only. Never persist raw article bodies. */
export async function collectScheduledDiscovery(source:SourceState,fetcher:typeof fetch=fetch,now=new Date()){
  if(source.sourceId.startsWith('wikinews-'))return {...await collectWikinews(source.sourceId,fetcher,now),cursor:{}};
  const desk=discoveryDesks.find(d=>d.id===source.sourceId);if(!desk)throw Error('SOURCE_NOT_APPROVED');
  let unchanged=false;const cursor={...source.cursor};
  const contract=source.sourceId==='nba-releases'?'nba-audience-v1':source.sourceId==='nfl-cardinals'?'nfl-supported-intake-v2':undefined;
  const contractChanged=!!contract&&cursor.contract!==contract;
  const conditional:typeof fetch=async(input,init)=>{
    const headers=new Headers(init?.headers);
    if(String(input)===desk.url&&source.sourceId!=='dimayor-releases'&&!contractChanged){if(cursor.etag)headers.set('If-None-Match',cursor.etag);if(cursor.modified)headers.set('If-Modified-Since',cursor.modified);}
    const response=await fetcher(input,{...init,headers});
    if(String(input)===desk.url){
      if(response.status===304){unchanged=true;return new Response(' ',{status:200});}
      if(response.ok){if(contract)cursor.contract=contract;for(const [key,header] of [['etag','etag'],['modified','last-modified']]){const value=response.headers.get(header);if(value&&value.length<256&&!/[\r\n]/.test(value))cursor[key]=value;else delete cursor[key];}}
    }
    return response;
  };
  const result=await collectDiscovery(source.sourceId,conditional,now);
  return {...result,status:unchanged?'NOT_MODIFIED':result.status,cursor};
}
export async function runNewsAutomation(repo:AutomationRepository,options:{key?:string;validationOnly:boolean;fetcher?:typeof fetch;now?:Date}){
  const started=performance.now(),workDeadlineMs=165000,minStoryWindowMs=110000;
  const clock=()=>options.now??new Date();let now=clock();const usage:ModelUsage={calls:0,inputTokens:0,outputTokens:0,microUsd:0};
  await repo.initialize(now);
  const claim=await repo.claim(!!options.key?.trim(),options.validationOnly,now);
  if(!('id' in claim))return {status:claim.reason,requests:0,published:[],changed:false};
  const runId=claim.id;
  const result={runId,sourceTiming:null as Awaited<ReturnType<typeof selectDueSources>>['timing']|null,stories:[] as {eventKey:string;sourceId:string;sport:string;status:string;slug?:string;usage:ModelUsage}[],batchStop:null as string|null,status:'completed',requests:0,discovered:0,corrections:0,withdrawn:0,published:[] as string[],changed:false,generation:options.key?'no-eligible-event':'MODEL_CREDENTIAL_MISSING',validatorRecovery:null as {correctionId:string;recovered:boolean}|null,candidates:{seen:0,outsideAuthorization:0,unchanged:0,reviewRequired:0,queueFull:0,selected:0,ownerOrDuplicateBlocked:0},sourceOutcomes:[] as {sourceId:string;status:string;requests:number}[]};
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
    const selected=await selectDueSources(repo,runId,!options.validationOnly&&!repo.canary&&!recovery&&performance.now()-started<10000,clock);
    now=selected.now;result.sourceTiming=selected.timing;const due=selected.sources;
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
      for(const candidate of found.candidates)await observe(announcements.find(f=>f.sourceUrl===candidate.url)??{kind:'metadata' as const,candidate,...('reviewReasons' in found&&(found.reviewReasons as Record<string,string>)[candidate.url]&&primaryReviewReasons.includes((found.reviewReasons as Record<string,PrimaryReviewReason>)[candidate.url])?{reason:(found.reviewReasons as Record<string,PrimaryReviewReason>)[candidate.url]}:{})});
      if(recovery?.source.sourceId===source.sourceId)result.validatorRecovery={correctionId:recovery.ticket.correctionId,recovered:await repo.finishValidatorRecovery(runId,recovery.ticket,announcements.find(f=>eventKey(f)===recovery.ticket.eventKey),now)};
    }
    const processed:string[]=[];
    const storyLimit=options.validationOnly||repo.canary?1:automationLimits.maxEventsPerRun;
    let paidStories=0;
    for(let index=0;index<storyLimit;index++){
      if(performance.now()-started>workDeadlineMs-minStoryWindowMs){result.batchStop='EXECUTION_WINDOW';break;}
      const event=await repo.eligiblePending(now,resultsValidated,processed);
      if(!event||!options.key||processed.includes(event.eventKey))break;
      processed.push(event.eventKey);result.candidates.selected++;
      if(event.facts.kind==='metadata')continue;
      const story={eventKey:event.eventKey,sourceId:event.facts.sourceId,sport:event.facts.kind==='result'?'football':event.facts.sport,status:'pending',usage:{calls:0,inputTokens:0,outputTokens:0,microUsd:0} as ModelUsage,slug:undefined as string|undefined};
      const blocker=await repo.publicationBlocker(event);
      if(blocker){result.generation=blocker;if(blocker==='OWNER_OR_DUPLICATE_RECORD')result.candidates.ownerOrDuplicateBlocked++;await repo.fail(event.eventKey,blocker);story.status=blocker;result.stories.push(story);continue;}
      if(factErrors(event.facts,now).length){result.generation='FACTS_NO_LONGER_ELIGIBLE';await repo.fail(event.eventKey,result.generation);story.status=result.generation;result.stories.push(story);continue;}
      if(paidStories){const stop=await repo.reserveAdditionalStory(runId,event.eventKey,now);if(stop){result.batchStop=stop;break;}}
      await repo.markAttempt(claim.id,event.eventKey);paidStories++;
      const assertActive=async()=>{await repo.assertActive(claim.id);if(performance.now()-started>workDeadlineMs-modelPolicy.timeoutMs-10000)throw Error('MODEL_EXECUTION_DEADLINE');};
      let checkpoint=0;
      const generated=await generateBriefing(event.facts,options.key,options.fetcher,assertActive,e=>repo.saveEvidence(claim.id,event.eventKey,checkpoint++,e));
      story.usage=generated.usage;story.status=generated.status;result.stories.push(story);result.generation=generated.status;
      for(const field of ['calls','inputTokens','outputTokens','microUsd'] as const)usage[field]+=generated.usage[field];
      for(const [stage,value] of Object.entries(generated.usage.stages??{})){const key=stage as keyof NonNullable<ModelUsage['stages']>;const old=(usage.stages??={})[key]??{inputTokens:0,outputTokens:0,microUsd:0};usage.stages[key]={inputTokens:old.inputTokens+value.inputTokens,outputTokens:old.outputTokens+value.outputTokens,microUsd:old.microUsd+value.microUsd};}
      if(generated.usage.failure)usage.failure=generated.usage.failure;
      if(paidStories===1)usage.audit=generated.usage.audit;else delete usage.audit;
      if(generated.usage.microUsd>automationLimits.reserveMicroUsd){await repo.fail(event.eventKey,'MODEL_SPEND_LIMIT_EXCEEDED');result.status='failed';result.batchStop='MODEL_SPEND_LIMIT_EXCEEDED';break;}
      if(generated.copy){
        publishingEvent=event.eventKey;const draft=toNewsDraft(generated.copy,event.facts,now);
        story.slug=await repo.publish(claim.id,event,draft,now);result.published.push(story.slug);publishingEvent=null;
      }else{
        await repo.fail(event.eventKey,generated.status);
        // Text/audit rejections are independent. Shared model transport/configuration failure stops this batch.
        if(generated.status.startsWith('MODEL_')&&!['MODEL_CORRECTION_INVALID','MODEL_COPY_INVALID','MODEL_AUDIT_INVALID'].includes(generated.status)){result.status='failed';result.batchStop=generated.status;break;}
      }
    }
    result.changed=!!(result.corrections||result.withdrawn||result.published.length);
    await repo.finish(claim.id,result,usage,result.status==='failed'?'failed':'completed');return result;
  }catch(error){
    // Intentionally no raw exception, URL, SQL or API response in logs/HTTP/audit.
    if(publishingEvent){
      const allowed=['OWNER_OR_DUPLICATE_RECORD','PUBLICATION_CONFLICT','SOURCE_DISABLED','SOURCE_CHANGED_DURING_GENERATION','PUBLICATION_PRESENTATION_INVALID','PUBLICATION_POLICY_FAILED','AUTOMATION_STOPPED_OR_LEASE_LOST'];
      const code=error instanceof Error&&allowed.includes(error.message)?error.message:'PUBLICATION_STORAGE_UNAVAILABLE';
      result.generation=code;const story=result.stories.find(s=>s.eventKey===publishingEvent);if(story)story.status=code;await repo.fail(publishingEvent,code);
    }
    result.status='failed';result.changed=!!(result.corrections||result.withdrawn||result.published.length);
    await repo.finish(claim.id,result,usage,'failed');return result;
  }finally{if(repo.canary)await repo.control({paused:true});}
}
