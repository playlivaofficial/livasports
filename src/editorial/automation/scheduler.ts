/** Schedule metadata never grants permission or changes the repository's due-time gate. */
export const newsCronSchedule='43 */6 * * *';
export function schedulerSlot(now:Date){
 const slot=new Date(now);slot.setUTCHours(Math.floor(slot.getUTCHours()/6)*6,43,0,0);
 if(+slot>+now)slot.setUTCHours(slot.getUTCHours()-6);
 return {scheduledAt:slot.toISOString(),nextScheduledAt:new Date(+slot+6*3600000).toISOString(),delaySeconds:Math.floor((+now-+slot)/1000)};
}
export interface SchedulerInvocation {
 startedAt:string;finishedAt:string|null;scheduledAt:string;delaySeconds:number;
 trigger:'reported-cron'|'authenticated-request';outcome:'incomplete'|'no-op'|'published'|'processed-empty'|'review'|'failed';
 status:string;runId:string|null;cacheInvalidation:'not-needed'|'requested'|'failed'|'not-reached';
}
export function invocationStart(userAgent:string|null,now=new Date()):SchedulerInvocation{
 const {scheduledAt,delaySeconds}=schedulerSlot(now);
 return {startedAt:now.toISOString(),finishedAt:null,scheduledAt,delaySeconds,trigger:userAgent==='vercel-cron/1.0'?'reported-cron':'authenticated-request',outcome:'incomplete',status:'started',runId:null,cacheInvalidation:'not-reached'};
}
export function invocationFinish(result:{status:string;runId?:string;generation?:string;published?:string[]},cacheInvalidation:SchedulerInvocation['cacheInvalidation'],now=new Date()):Partial<SchedulerInvocation>{
 const noOp=['disabled','paused','not-due','model-budget','discovery-budget','canary-not-due','canary-expired','canary-consumed','canary-model-disabled'].includes(result.status);
 const outcome=(!noOp&&result.status!=='completed')||cacheInvalidation==='failed'?'failed':noOp?'no-op':result.published?.length?'published':result.generation&& !['VALIDATED','no-eligible-event','MODEL_CREDENTIAL_MISSING'].includes(result.generation)?'review':'processed-empty';
 return {finishedAt:now.toISOString(),outcome,status:noOp||result.status==='completed'?result.status:'failed',runId:result.runId&&/^[a-f0-9-]{36}$/.test(result.runId)?result.runId:null,cacheInvalidation};
}
export function reliabilitySummary(rows:SchedulerInvocation[],now=new Date()){
 const reported=rows.filter(x=>x.trigger==='reported-cron'),slots=new Set(reported.map(x=>x.scheduledAt));
 const start=reported.length?Math.min(...reported.map(x=>Date.parse(x.scheduledAt))):null;
 const missing:string[]=[];
 if(start!==null)for(let time=Math.max(start,Date.parse(schedulerSlot(new Date(+now-86400000*7)).nextScheduledAt));time<=+now-15*60000;time+=6*3600000){const slot=schedulerSlot(new Date(time)).scheduledAt;if(!slots.has(slot))missing.push(slot);}
 return {nextScheduledAt:schedulerSlot(now).nextScheduledAt,reportedCronInvocations:reported.length,distinctObservedSlots:slots.size,publishedCycles:reported.filter(x=>x.outcome==='published').length,noOpInvocations:rows.filter(x=>x.outcome==='no-op').length,incomplete:rows.filter(x=>x.outcome==='incomplete'&&+now-Date.parse(x.startedAt)>180000).length,missingSlots:missing};
}
