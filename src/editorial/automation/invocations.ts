import type {QueryExecutor} from '@/database/client';
import {invocationStart,invocationFinish,type SchedulerInvocation} from './scheduler';
/** Bounded operations history only. Financial, grant and editorial audits are never pruned. */
export async function beginInvocation(db:QueryExecutor,userAgent:string|null,now=new Date()){
 await db.query("DELETE FROM editorial_automation_audit WHERE action='scheduler-invocation' AND recorded_at<now()-interval '30 days'");
 return (await db.query<{id:string}>("INSERT INTO editorial_automation_audit(action,detail) VALUES ('scheduler-invocation',$1) RETURNING id::text",[JSON.stringify(invocationStart(userAgent,now))])).rows[0].id;
}
export async function finishInvocation(db:QueryExecutor,id:string,result:Parameters<typeof invocationFinish>[0],cache:SchedulerInvocation['cacheInvalidation']){
 await db.query("UPDATE editorial_automation_audit SET detail=detail||$2::jsonb WHERE id=$1 AND action='scheduler-invocation'",[id,JSON.stringify(invocationFinish(result,cache))]);
}
