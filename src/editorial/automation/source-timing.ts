import type {AutomationRepository} from './repository';
/** One real elapsed-time wait, never a grace period granting early permission. */
export async function selectDueSources(repo:Pick<AutomationRepository,'dueSources'|'nextSourceDue'|'assertActive'>,runId:string,allowWait:boolean,clock:()=>Date=()=>new Date()){
 let checkedAt=clock(),sources=await repo.dueSources(checkedAt);
 const timing={checkedAt:checkedAt.toISOString(),waitedMs:0,nextDueAt:null as string|null,recheckedAt:null as string|null};
 if(!allowWait||sources.length)return {sources,now:checkedAt,timing};
 const next=await repo.nextSourceDue(checkedAt,45000);
 if(!next)return {sources,now:checkedAt,timing};
 timing.nextDueAt=next;
 const delay=Date.parse(next)-+clock();
 if(!Number.isFinite(delay)||delay>45000)return {sources,now:checkedAt,timing};
 await repo.assertActive(runId);
 const started=performance.now();
 if(delay>0)await new Promise<void>(resolve=>setTimeout(resolve,delay));
 timing.waitedMs=Math.round(performance.now()-started);
 await repo.assertActive(runId);
 checkedAt=clock();timing.recheckedAt=checkedAt.toISOString();
 // Even an early timer wake, clock adjustment or changed due date must pass SQL again.
 sources=await repo.dueSources(checkedAt);
 return {sources,now:checkedAt,timing};
}
