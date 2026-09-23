import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {canTransitionGrowthStatus,persistGrowthItem,readRightsFallbackDraftsForRegeneration,readV1DraftsForRegeneration,readPremiumDraftsForRegeneration,transitionGrowthChannel} from './repository';
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
  it('persists one video row per supplied platform and links controlled draft regeneration',async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes('SELECT i.id FROM growth_content_items'))return {rows:[{id:'old'}],rowCount:1};
      if(sql.includes('COALESCE(max(revision)'))return {rows:[{revision:2}],rowCount:1};
      if(sql.includes('INSERT INTO growth_content_items'))return {rows:[{id:'22222222-2222-4222-8222-222222222222'}],rowCount:1};return {rows:[],rowCount:1};
    });
    const video={channel:'TIKTOK' as const,status:'READY' as const,mimeType:'video/mp4' as const,sha256:'a'.repeat(64),byteLength:4,data:Buffer.from('mp4!')};
    await persistGrowthItem(database(query as unknown as QueryExecutor['query']),{...input(true),videos:[video],supersedesItemId:'11111111-1111-4111-8111-111111111111'});
    const assetInsert=query.mock.calls.find(call=>String(call[0]).includes('INSERT INTO growth_platform_assets'));expect(assetInsert).toBeDefined();
    expect(String(assetInsert?.[0])).toContain('$9::timestamptz');
    expect(query.mock.calls.some(call=>String(call[0]).includes('SET superseded_at'))).toBe(true);
  });
  it('selects only active legacy items whose every platform remains DRAFT',async()=>{
    const query=vi.fn(async(sql:string)=>{void sql;return {rows:[],rowCount:0};});await readV1DraftsForRegeneration(database(query as unknown as QueryExecutor['query']));
    const sql=String(query.mock.calls[0][0]);expect(sql).toContain('generator_version<2');expect(sql).toContain("ch.status<>'DRAFT'");expect(sql).toContain('superseded_at IS NULL');
  });
  it('selects only all-DRAFT legacy or incomplete premium revisions for safe repair',async()=>{
    const query=vi.fn(async(sql:string)=>{void sql;return {rows:[],rowCount:0};});await readPremiumDraftsForRegeneration(database(query as unknown as QueryExecutor['query']));
    expect(query.mock.calls[0][0]).toContain("a.status<>'READY'");
    expect(query.mock.calls[0][0]).toContain("{voice,degradedReason}");
    const sql=String(query.mock.calls[0][0]);expect(sql).toContain("<>'PREMIUM_1'");expect(sql).toContain("ch.status<>'DRAFT'");expect(sql).toContain('superseded_at IS NULL');
  });
  it('keeps the predecessor when review changed while a replacement was rendering',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    await expect(persistGrowthItem(database(query as unknown as QueryExecutor['query']),{...input(true),supersedesItemId:'old'})).rejects.toThrow('DRAFT_REGENERATION_NOT_ALLOWED');
    const calls=query.mock.calls as unknown as Array<[string]>;
    expect(calls.some(([sql])=>sql.includes('ORDER BY channel FOR UPDATE'))).toBe(true);
    expect(calls.some(([sql])=>sql.includes('INSERT INTO'))).toBe(false);
  });
  it('selects only current all-DRAFT player-led items that lack approved commercial media',async()=>{
    const query=vi.fn(async(sql:string)=>{void sql;return {rows:[],rowCount:0};});await readRightsFallbackDraftsForRegeneration(database(query as unknown as QueryExecutor['query']));
    const sql=String(query.mock.calls[0][0]);expect(sql).toContain("IN('PLAYER_VS_PLAYER','STAR_FOCUS')");expect(sql).toContain('commercialEligible');
    expect(sql).toContain("ch.status<>'DRAFT'");expect(sql).toContain('superseded_at IS NULL');
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
