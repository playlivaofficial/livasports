import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {canTransitionGrowthStatus,persistGrowthItem,transitionGrowthChannel} from './repository';
import {generatedContent} from './content';
import {rankedFixture,testNow} from './fixtures.test-support';

function database(query:QueryExecutor['query']):DatabaseClient{return {query,transaction:work=>work({query}),close:async()=>undefined};}
function input(force=false){const row=rankedFixture(),material=generatedContent(row);return {fixtureId:row.signals.fixtureId,sourceHash:material.sourceHash,trigger:'OWNER' as const,
  priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,fixture:material.fixture,content:material.content,
  canonicalUrl:row.destinationUrl,tracking:material.tracking,now:testNow,force};}

describe('Traffic Engine V1 persistence',()=>{
  it('enforces approval/rejection/published transitions',()=>{
    expect(canTransitionGrowthStatus('DRAFT','APPROVED')).toBe(true);expect(canTransitionGrowthStatus('DRAFT','REJECTED')).toBe(true);
    expect(canTransitionGrowthStatus('APPROVED','PUBLISHED')).toBe(true);expect(canTransitionGrowthStatus('REJECTED','APPROVED')).toBe(true);
    expect(canTransitionGrowthStatus('DRAFT','PUBLISHED')).toBe(false);expect(canTransitionGrowthStatus('PUBLISHED','REJECTED')).toBe(false);
  });
  it('suppresses a rerun inside the duplicate window before inserting anything',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:[],rowCount:sql.includes('SELECT 1 FROM growth_content_items')?1:0}));
    const result=await persistGrowthItem(database(query as unknown as QueryExecutor['query']),input());
    expect(result).toBeNull();expect(query.mock.calls.some(call=>String(call[0]).includes('INSERT INTO growth_content_items'))).toBe(false);
  });
  it('creates an explicit owner revision and exactly one row per supported channel',async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('COALESCE(max(revision)'))return {rows:[{revision:2}],rowCount:1};
      if(sql.includes('INSERT INTO growth_content_items'))return {rows:[{id:'22222222-2222-4222-8222-222222222222'}],rowCount:1};
      return {rows:[],rowCount:1};
    });
    expect(await persistGrowthItem(database(query as unknown as QueryExecutor['query']),input(true))).toEqual({id:'22222222-2222-4222-8222-222222222222',revision:2});
    expect(query.mock.calls.filter(call=>String(call[0]).includes('INSERT INTO growth_content_channels'))).toHaveLength(4);
  });
  it('locks and performs one valid state update, rejecting invalid transitions',async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes('SELECT status')?{rows:[{status:'APPROVED'}],rowCount:1}:{rows:[],rowCount:1});
    const db=database(query as unknown as QueryExecutor['query']);
    expect(await transitionGrowthChannel(db,'11111111-1111-4111-8111-111111111111','TIKTOK','PUBLISHED',testNow)).toBe(true);
    expect(query.mock.calls.some(call=>String(call[0]).includes("published_at=CASE"))).toBe(true);
    query.mockImplementation(async(sql:string)=>sql.includes('SELECT status')?{rows:[{status:'DRAFT'}],rowCount:1}:{rows:[],rowCount:1});
    expect(await transitionGrowthChannel(db,'11111111-1111-4111-8111-111111111111','TIKTOK','PUBLISHED',testNow)).toBe(false);
  });
});
