import {describe,it,expect,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
vi.mock('../budget',()=>({budgetHealth:async()=>({verified:true})}));
import {readReliabilityHealth} from './read';
describe('core GEO reliability never greenwashes an unverified operator pool',()=>{
  it('shows three missing pools, no BR insurance targets and a critical mapping incident without provider requests',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    const health=await readReliabilityHealth({query} as unknown as QueryExecutor,new Date('2026-10-04T10:00:00Z'));
    expect(health.overall).toBe('CRITICAL');expect(health.platformHealth).toBe('DEGRADED');expect(health.upstreamCoverageHealth).toBe('UNVERIFIED');
    expect(health.geoPools?.map(p=>[p.geo,p.verifiedFeeds])).toEqual([['MX',0],['CO',0],['PE',0]]);
    expect(health.dataPlane).toMatchObject({state:'DEGRADED',targets:[],providerRequests:0});
    expect(health.global).toContainEqual(expect.objectContaining({classification:'MAPPING_FAILED',severity:'CRITICAL'}));
    expect(health.fourSource).toBeUndefined();expect(health.nativeCoverage).toBeUndefined();expect(health.continuity).toBeUndefined();
  });
});
