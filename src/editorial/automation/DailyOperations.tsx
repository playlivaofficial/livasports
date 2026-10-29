import type {AutomationRepository} from './repository';
import {operationTimestamp} from './reporting';
type Dashboard=Awaited<ReturnType<AutomationRepository['dashboard']>>&{enabled?:boolean;modelEnabled?:boolean;modelConfigured?:boolean};
export function operationalStatus(data:Pick<Dashboard,'paused'|'enabled'|'modelEnabled'|'modelConfigured'|'usage'|'limits'>){
 if(data.paused)return 'PAUSED';
 if(!data.enabled||!data.modelEnabled||!data.modelConfigured)return 'DISABLED';
 if(data.usage.monthReservedMicroUsd+data.limits.reserveMicroUsd>data.limits.maxMonthlyMicroUsd)return 'BUDGET BLOCKED';
 return 'ACTIVE';
}
export function DailyOperations({data}:{data:Dashboard}){
 const daily=data.daily,lastCompleted=data.runs.find(r=>r.finished_at),lastError=data.runs.find(r=>r.status==='failed');
 const remaining=Math.max(0,data.limits.maxMonthlyMicroUsd-data.usage.monthReservedMicroUsd);
 return <section aria-label="Daily publishing status"><h3>Autonomous publishing · {operationalStatus(data)}</h3><p>UTC day · four scheduled cycles, up to two stories per cycle and five daily reservations when verified news qualifies. No story quota is forced.</p><div className="ed-operation-metrics"><div><small>Published today</small><strong>{daily?.published??0}</strong></div><div><small>Held for review today</small><strong>{daily?.review??0}</strong></div><div><small>Skipped invocations today</small><strong>{daily?.skipped??0}</strong></div><div><small>Today’s measured AI cost</small><strong>${((daily?.modelMicroUsd??0)/1e6).toFixed(6)}</strong></div><div><small>Monthly budget available</small><strong>${(remaining/1e6).toFixed(3)}</strong></div></div><p>Completed processing cycles today: {daily?.completed??0} · failed: {daily?.failed??0}. These are not all publishing successes. Budget availability deducts conservative reservations, including interrupted or empty runs.</p><p>Last completed processing: {lastCompleted?operationTimestamp(lastCompleted.finished_at):'No completed run observed'}. Last failed processing: {lastError?`${operationTimestamp(lastError.finished_at??lastError.started_at)} · inspect recent runs below`:'None recorded in recent runs'}.</p></section>;
}
