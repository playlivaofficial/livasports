import {SportsRepository} from '@/multisport/repository';
import {assertOpenLigaSnapshot} from '@/multisport/openligadb';
import {collectDiscovery} from '../discovery-collector';
import {collectWikinews} from '../wikinews-discovery';
import {discoveryDesks} from '../discovery';
import {AutomationRepository,type SourceState} from './repository';
import {generateBriefing,type ModelUsage} from './generation';
import {resultsFromSnapshot,toNewsDraft,factErrors,automationSources} from './policy';
import type {AnnouncementFacts} from './announcements';

/** Cache validators apply to a fixed, approved index only. Never persist raw article bodies. */
export async function collectScheduledDiscovery(source:SourceState,fetcher:typeof fetch=fetch,now=new Date()){
  if(source.sourceId.startsWith('wikinews-'))return {...await collectWikinews(source.sourceId,fetcher,now),cursor:{}};
  const desk=discoveryDesks.find(d=>d.id===source.sourceId);if(!desk)throw Error('SOURCE_NOT_APPROVED');
  let unchanged=false;const cursor={...source.cursor};
  const conditional:typeof fetch=async(input,init)=>{
    const headers=new Headers(init?.headers);
    if(String(input)===desk.url){if(cursor.etag)headers.set('If-None-Match',cursor.etag);if(cursor.modified)headers.set('If-Modified-Since',cursor.modified);}
    const response=await fetcher(input,{...init,headers});
    if(String(input)===desk.url){
      if(response.status===304){unchanged=true;return new Response(' ',{status:200});}
      if(response.ok){for(const [key,header] of [['etag','etag'],['modified','last-modified']]){const value=response.headers.get(header);if(value&&value.length<256&&!/[\r\n]/.test(value))cursor[key]=value;else delete cursor[key];}}
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
  const result={status:'completed',requests:0,discovered:0,corrections:0,withdrawn:0,published:[] as string[],changed:false,generation:options.key?'no-eligible-event':'MODEL_CREDENTIAL_MISSING'};
  try{
    let resultsValidated=false;
    if(await repo.sourceEnabled('openliga-results')){
      try{
      const snapshot=await new SportsRepository(repo.db).findPublished('bundesliga');
      // A storage/source failure is NOT a retraction. Only a validated replacement can retract.
      if(snapshot){
        assertOpenLigaSnapshot(snapshot,now);
        const facts=resultsFromSnapshot(snapshot,now);
        for(const item of facts){const state=await repo.observe(claim.id,item,now);if(state==='new')result.discovered++;if(state==='changed')result.corrections++;}
        const completedKeys=new Set(snapshot.events.filter(e=>e.status==='completed').map(e=>`bundesliga:${snapshot.season}:${e.id}`));
        result.withdrawn=await repo.reconcile(claim.id,completedKeys,now);
        resultsValidated=true;
        await repo.finishSource(claim.id,'openliga-results','RESULTS_VALIDATED',0,{},now);
      }
      }catch{await repo.finishSource(claim.id,'openliga-results','RESULT_VALIDATION_FAILED',0,{},now);}
    }
    for(const source of await repo.dueSources(now)){
      // An article-backed source costs three reads. Never exceed the four reads reserved by claim.
      const requestLimit=automationSources.find(s=>s.id===source.sourceId)?.requestLimit;
      if(requestLimit===undefined||result.requests+requestLimit>4)continue;
      if(!await repo.sourceEnabled(source.sourceId))continue;
      const found=await collectScheduledDiscovery(source,options.fetcher,now);result.requests+=found.requests;
      await repo.finishSource(claim.id,source.sourceId,found.status,found.requests,found.cursor,now);
      const announcements:AnnouncementFacts[]='announcements' in found&&Array.isArray(found.announcements)?found.announcements:[];
      for(const candidate of found.candidates){const facts=announcements.find(f=>f.sourceUrl===candidate.url)??{kind:'metadata' as const,candidate};const state=await repo.observe(claim.id,facts,now);if(state==='new')result.discovered++;if(state==='changed')result.corrections++;}
    }
    const event=await repo.pending();
    if(event&&options.key&&(event.facts.kind==='announcement'||(event.facts.kind==='result'&&resultsValidated))){
      if(factErrors(event.facts,now).length){result.generation='FACTS_NO_LONGER_ELIGIBLE';await repo.fail(event.eventKey,result.generation);}
      else{
        await repo.markAttempt(claim.id,event.eventKey);
        let checkpoint=0;
        const generated=await generateBriefing(event.facts,options.key,options.fetcher,()=>repo.assertActive(claim.id),e=>repo.saveEvidence(claim.id,event.eventKey,checkpoint++,e));Object.assign(usage,generated.usage);result.generation=generated.status;
        if(generated.copy){const draft=toNewsDraft(generated.copy,event.facts,now);result.published.push(await repo.publish(claim.id,event,draft,now));}
        else{await repo.fail(event.eventKey,generated.status);if(generated.status.startsWith('MODEL_'))result.status='failed';}
      }
    }
    result.changed=!!(result.corrections||result.withdrawn||result.published.length);
    await repo.finish(claim.id,result,usage,result.status==='failed'?'failed':'completed');return result;
  }catch{
    // Intentionally no raw exception, URL, SQL or API response in logs/HTTP/audit.
    result.status='failed';result.changed=!!(result.corrections||result.withdrawn||result.published.length);
    await repo.finish(claim.id,result,usage,'failed');return result;
  }
}
