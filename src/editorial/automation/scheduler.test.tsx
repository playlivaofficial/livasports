import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {invocationStart,invocationFinish,reliabilitySummary,schedulerSlot,newsCronSchedule} from './scheduler';
import {SchedulerHistory} from './SchedulerHistory';
import type {AutomationRepository} from './repository';
describe('scheduler evidence classification',()=>{
 it('matches the actual deployment cron without changing its cadence',()=>expect(JSON.parse(readFileSync('vercel.json','utf8')).crons.find((x:{path:string})=>x.path==='/api/internal/editorial/news-cycle').schedule).toBe(newsCronSchedule));
 it('computes real UTC slots across midnight and avoids future slots',()=>{
  expect(schedulerSlot(new Date('2026-10-27T00:42:59Z'))).toEqual({scheduledAt:'2026-10-26T18:43:00.000Z',nextScheduledAt:'2026-10-27T00:43:00.000Z',delaySeconds:21599});
  expect(schedulerSlot(new Date('2026-10-27T12:43:32Z')).delaySeconds).toBe(32);
 });
 it.each(['disabled','paused','not-due','model-budget','model-configuration','canary-consumed'])('never counts %s as a publishing cycle',status=>{
  const row={...invocationStart('vercel-cron/1.0',new Date('2026-10-27T12:43:32Z')),...invocationFinish({status},'not-needed')};
  expect(row.outcome).toBe('no-op');expect(reliabilitySummary([row]).publishedCycles).toBe(0);
 });
 it('does not upgrade a manually authenticated request to scheduled publication',()=>{
  const row={...invocationStart('manual-synthetic',new Date('2026-10-27T12:43:32Z')),...invocationFinish({status:'completed',published:['synthetic']},'requested')};
  expect(reliabilitySummary([row]).reportedCronInvocations).toBe(0);expect(reliabilitySummary([row]).publishedCycles).toBe(0);expect(JSON.stringify(row)).not.toContain('manual-synthetic');
 });
 it('distinguishes empty, rejected, failed and invalidation-failed cycles',()=>{
  expect(invocationFinish({status:'completed',generation:'no-eligible-event'},'not-needed').outcome).toBe('processed-empty');
  expect(invocationFinish({status:'completed',generation:'EDITORIAL_REVIEW_REQUIRED'},'not-needed').outcome).toBe('review');
  expect(invocationFinish({status:'failed'},'not-reached').outcome).toBe('failed');
  expect(invocationFinish({status:'completed',published:['synthetic']},'failed').outcome).toBe('failed');
 });
 it('identifies an unfinished invocation and missing later slot without inventing prior history',()=>{
  const row=invocationStart('vercel-cron/1.0',new Date('2026-10-27T06:43:00Z'));
  const s=reliabilitySummary([row],new Date('2026-10-27T13:00:00Z'));
  expect(s.incomplete).toBe(1);expect(s.missingSlots).toEqual(['2026-10-27T12:43:00.000Z']);
  expect(reliabilitySummary([],new Date('2026-10-27T13:00:00Z')).missingSlots).toEqual([]);
 });
 it('shows no-op observations honestly in the Owner view',()=>{
  const row={...invocationStart('vercel-cron/1.0',new Date('2026-10-27T12:43:32Z')),...invocationFinish({status:'disabled'},'not-needed',new Date('2026-10-27T12:43:33Z'))};
  const data={observedAt:'2026-10-27T13:00:00Z',invocations:[row],leases:{active:0,expired:0}} as Awaited<ReturnType<AutomationRepository['dashboard']>>;
  const html=renderToStaticMarkup(<SchedulerHistory data={data}/>);expect(html).toContain('0 publishing cycles');expect(html).toContain('disabled');expect(html).toContain('not independent proof');
 });
});
