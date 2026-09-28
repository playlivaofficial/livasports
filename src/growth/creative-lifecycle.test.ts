import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {persistGrowthItem,rebuildCurrentGrowthQueue,staleCreativeGrowthItems} from './repository';
import {generatedContent,contentIdentity} from './content';
import {rankedFixture,testNow} from './fixtures.test-support';
import {CREATIVE_VERSION,LEGACY_CREATIVE_VERSION,isCurrentCreative,isStaleCreative} from './creative-version';

function database(query:QueryExecutor['query']):DatabaseClient{return {query,transaction:work=>work({query}),close:async()=>undefined};}
function input(over:Record<string,unknown>={}){
  const row=rankedFixture(),material=generatedContent(row);
  return {fixtureId:row.signals.fixtureId,sourceHash:material.sourceHash,contentIdentity:material.contentIdentity,
    trigger:'AUTOMATIC' as const,priorityScore:row.priority.total,scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,
    fixture:material.fixture,content:{...material.content,assetModel:'MASTER_V1' as const},canonicalUrl:row.destinationUrl,tracking:material.tracking,
    now:testNow,force:false,...over};
}
/** Stands in for the table: the duplicate probe answers from `existing`, everything else succeeds. */
function world(existing:Array<{creativeVersion:string;contentIdentity:string|null}>){
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});
    if(sql.includes('SELECT 1')&&sql.includes('growth_content_items')){
      const [,,version,identity]=params as [string,Date,string,string|null];
      const hit=existing.some(row=>row.creativeVersion===version&&(identity===null||row.contentIdentity===null||row.contentIdentity===identity));
      return {rows:hit?[{n:1}]:[],rowCount:hit?1:0};
    }
    if(sql.includes('COALESCE(max(revision)'))return {rows:[{revision:1}],rowCount:1};
    if(sql.includes('INSERT INTO growth_content_items'))return {rows:[{id:'item-new'}],rowCount:1};
    return {rows:[],rowCount:0};
  });
  return {db:database(query as unknown as QueryExecutor['query']),calls,
    inserted:()=>calls.some(c=>c.sql.includes('INSERT INTO growth_content_items'))};
}

describe('creative version identity',()=>{
  it('composes an explicit, queryable version from the shipped stack',()=>{
    expect(CREATIVE_VERSION).toMatch(/^cs3\.master-story-feed\.STABLE_MOTION_2\.1080x1920@18\.audio-v1\.voice-cache2$/);
    expect(isCurrentCreative(CREATIVE_VERSION)).toBe(true);
    expect(isStaleCreative(LEGACY_CREATIVE_VERSION)).toBe(true);
    expect(isStaleCreative(null)).toBe(true);
  });
});

describe('version-aware duplicate prevention',()=>{
  it('(1) same fixture + same content + current creative version → generation skipped',async()=>{
    const identity=contentIdentity(rankedFixture());
    const {db,inserted}=world([{creativeVersion:CREATIVE_VERSION,contentIdentity:identity}]);
    expect(await persistGrowthItem(db,input())).toBeNull();
    expect(inserted()).toBe(false);
  });
  it('(2) same fixture + same content + OLDER creative version → one regeneration happens',async()=>{
    const identity=contentIdentity(rankedFixture());
    const {db,inserted}=world([{creativeVersion:LEGACY_CREATIVE_VERSION,contentIdentity:identity}]);
    expect(await persistGrowthItem(db,input())).toEqual({id:'item-new',revision:1});
    expect(inserted()).toBe(true);
  });
  it('(3) after regeneration the next run skips again',async()=>{
    const identity=contentIdentity(rankedFixture());
    const {db,inserted}=world([{creativeVersion:LEGACY_CREATIVE_VERSION,contentIdentity:identity},{creativeVersion:CREATIVE_VERSION,contentIdentity:identity}]);
    expect(await persistGrowthItem(db,input())).toBeNull();
    expect(inserted()).toBe(false);
  });
  it('(4) a creative-version bump makes current content stale exactly once',async()=>{
    const identity=contentIdentity(rankedFixture());
    // Everything stored belongs to the previous stack, whatever that stack was called.
    const {db}=world([{creativeVersion:'cs0.OLD_MOTION.1080x1920@15.audio-v1',contentIdentity:identity}]);
    expect(await persistGrowthItem(db,input())).not.toBeNull();
    const after=world([{creativeVersion:CREATIVE_VERSION,contentIdentity:identity}]);
    expect(await persistGrowthItem(after.db,input())).toBeNull();
  });
  it('regenerates when the rendered facts change even on the current creative version',async()=>{
    const {db,inserted}=world([{creativeVersion:CREATIVE_VERSION,contentIdentity:'a-different-identity'}]);
    expect(await persistGrowthItem(db,input())).not.toBeNull();
    expect(inserted()).toBe(true);
  });
  it('stamps both the item and its media with the creative version it was produced by',async()=>{
    const {db,calls}=world([]);
    await persistGrowthItem(db,input({videos:[{channel:'TIKTOK',status:'READY',mimeType:'video/mp4',sha256:'a'.repeat(64),byteLength:10,data:Buffer.from('x'),renderMetadata:{sceneTiming:[],voice:{}}}]}));
    const item=calls.find(c=>c.sql.includes('INSERT INTO growth_content_items'))!;
    const asset=calls.find(c=>c.sql.includes('INSERT INTO growth_platform_assets'))!;
    expect(item.sql).toContain('creative_version,content_identity');
    expect(item.params).toContain(CREATIVE_VERSION);
    expect(asset.sql).toContain('creative_version');
    expect(asset.params).toContain(CREATIVE_VERSION);
  });
});

describe('content identity avoids hash churn',()=>{
  it('ignores the live priority score, which moves every run as kickoff approaches',()=>{
    const base=rankedFixture();
    const drifted={...base,priority:{...base.priority,total:base.priority.total+11}};
    expect(contentIdentity(drifted)).toBe(contentIdentity(base));
    // The provenance hash is allowed to move; the regeneration identity is not.
    expect(generatedContent(drifted).sourceHash).not.toBe(generatedContent(base).sourceHash);
  });
  it('changes when a fact the video renders changes',()=>{
    const base=rankedFixture();
    const moved={...base,signals:{...base.signals,kickoff:new Date(Date.parse(base.signals.kickoff)+7200000).toISOString()}};
    expect(contentIdentity(moved)).not.toBe(contentIdentity(base));
  });
});

describe('current queue versus history',()=>{
  it('(7,8,9) rebuilds the queue from the latest ranking and never deletes anything',async()=>{
    const calls:Array<{sql:string;params:unknown[]}>=[];
    const query=vi.fn(async(sql:string,params:unknown[]=[])=>{calls.push({sql,params});return {rows:[],rowCount:2};});
    const db=database(query as unknown as QueryExecutor['query']);
    const result=await rebuildCurrentGrowthQueue(db,[{fixtureId:'11111111-1111-4111-8111-111111111111',rank:1,topSocial:true},
      {fixtureId:'22222222-2222-4222-8222-222222222222',rank:2,topSocial:false}],testNow);
    expect(result).toEqual({current:2});
    // Every previously current row is cleared first, so a fixture that left the Top 10 stops being current...
    expect(calls[1].sql).toContain('SET current_rank=NULL,current_shortlist=false');
    // ...and nothing is ever deleted.
    expect(calls.some(c=>/DELETE/i.test(c.sql))).toBe(false);
    const update=calls.find(c=>c.sql.includes('SET current_rank=w.rank'))!;
    expect(update.sql).toContain('superseded_at IS NULL');
    expect(JSON.parse(String(update.params[0]))).toEqual([
      {fixture_id:'11111111-1111-4111-8111-111111111111',rank:1,top_social:true},
      {fixture_id:'22222222-2222-4222-8222-222222222222',rank:2,top_social:false}]);
  });
  it('(10) an empty ranking clears the queue instead of leaving a stale shortlist behind',async()=>{
    const calls:string[]=[];
    const query=vi.fn(async(sql:string)=>{calls.push(sql);return {rows:[],rowCount:0};});
    expect(await rebuildCurrentGrowthQueue(database(query as unknown as QueryExecutor['query']),[],testNow)).toEqual({current:0});
    expect(calls.some(sql=>sql.includes('SET current_rank=NULL'))).toBe(true);
  });
  it('(6) stale detection only returns current, unreviewed items on an older stack',async()=>{
    let captured={sql:'',params:[] as unknown[]};
    const query=vi.fn(async(sql:string,params:unknown[]=[])=>{captured={sql,params};return {rows:[{id:'i1',fixture_id:'f1'}],rowCount:1};});
    const rows=await staleCreativeGrowthItems({query:query as unknown as QueryExecutor['query']},2,CREATIVE_VERSION);
    expect(rows).toEqual([{id:'i1',fixture_id:'f1'}]);
    expect(captured.sql).toContain('current_rank IS NOT NULL');
    expect(captured.sql).toContain('creative_version IS DISTINCT FROM $2');
    // An approved or published creative is never silently replaced underneath the owner.
    expect(captured.sql).toContain("status NOT IN('DRAFT','REJECTED')");
    expect(captured.sql).toContain('i.current_shortlist DESC');
    expect(captured.params).toEqual([2,CREATIVE_VERSION]);
  });
});
