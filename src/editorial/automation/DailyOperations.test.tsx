import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {DailyOperations,operationalStatus} from './DailyOperations';
import {automationLimits} from './policy';
import type {AutomationRepository} from './repository';
const data={paused:false,enabled:true,modelEnabled:true,modelConfigured:true,limits:automationLimits,usage:{monthReservedMicroUsd:20000},daily:{published:1,review:2,skipped:3,completed:4,failed:0,modelMicroUsd:515},runs:[{status:'completed',finished_at:new Date('2026-10-27T12:43:46Z')}] } as unknown as Awaited<ReturnType<AutomationRepository['dashboard']>>&{enabled:boolean;modelEnabled:boolean;modelConfigured:boolean};
describe('daily recurring newsroom operations',()=>{
 it('distinguishes active, emergency pause, disabled configuration and reserved budget exhaustion',()=>{
  expect(operationalStatus(data)).toBe('ACTIVE');expect(operationalStatus({...data,paused:true})).toBe('PAUSED');expect(operationalStatus({...data,modelConfigured:false})).toBe('DISABLED');expect(operationalStatus({...data,usage:{...data.usage,monthReservedMicroUsd:2990000}})).toBe('BUDGET BLOCKED');
 });
 it('shows actual publication counts, UTC completion and measured versus reserved money',()=>{
  const html=renderToStaticMarkup(<DailyOperations data={data}/>);expect(html).toContain('Published today');expect(html).toContain('$0.000515');expect(html).toContain('$2.980');expect(html).toContain('2026-10-27T12:43:46.000Z');expect(html).toContain('not all publishing successes');
 });
});
