import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./repository',()=>({readGrowthItem:vi.fn()}));
import {readGrowthItem} from './repository';
import {markGrowthPosted} from './manual-repository';
import {publishingItem} from './manual.test-support';
import {postSnapshot} from './manual-publishing';
import type {DatabaseClient,QueryExecutor} from '@/database/client';

function world(){const item=publishingItem();let inserted=false;const calls:Array<{sql:string;values:readonly unknown[]}>=[];
  const query=vi.fn(async(sql:string,values:readonly unknown[]=[])=>{calls.push({sql,values});
    if(sql.startsWith('SELECT i.id'))return {rows:[{id:item.id}],rowCount:1};
    if(sql.startsWith('INSERT INTO growth_manual_posts')){if(inserted)return {rows:[],rowCount:0};inserted=true;return {rows:[{id:'post-id'}],rowCount:1};}
    if(sql.startsWith('UPDATE growth_content_channels'))item.channels[0].status='PUBLISHED';
    return {rows:[],rowCount:0};});
  const db={query,transaction:async(work:(tx:QueryExecutor)=>Promise<unknown>)=>work({query:query as unknown as QueryExecutor['query']}),close:async()=>undefined} as unknown as DatabaseClient;
  vi.mocked(readGrowthItem).mockImplementation(async()=>structuredClone(item));
  return {item,db,calls,input:{itemId:item.id,channel:'TIKTOK' as const,sha256:'a'.repeat(64),creativeVersion:item.creativeVersion!,notes:'Manual QA'}};
}
beforeEach(()=>vi.clearAllMocks());
describe('atomic posting evidence',()=>{
  it('persists exact asset, copy, version, owner pseudonym and timestamp; reload and repeat preserve one receipt',async()=>{
    const w=world(),now=new Date('2026-09-27T12:00:00Z');expect(await markGrowthPosted(w.db,w.input,'private-session',now)).toEqual({id:'post-id',postedAt:now.toISOString()});
    const insert=w.calls.find(c=>c.sql.startsWith('INSERT INTO growth_manual_posts'))!;
    expect(insert.values).toContain(w.item.creativeVersion);expect(insert.values).toContain('a'.repeat(64));
    expect(JSON.parse(String(insert.values[11]))).toEqual(postSnapshot(w.item,'TIKTOK'));expect(insert.values).not.toContain('private-session');
    expect(w.item.channels[0].status).toBe('PUBLISHED');await expect(markGrowthPosted(w.db,w.input,'private-session',now)).rejects.toThrow('ALREADY_POSTED');
    expect(w.calls.filter(c=>c.sql.startsWith('INSERT INTO growth_manual_posts'))).toHaveLength(1);
    expect(w.item.channels[1].status).toBe('DRAFT');expect(w.calls.some(c=>/voice_clip|generation_jobs|video_data/.test(c.sql))).toBe(false);
  });
  it('blocks stale hash, superseded version and rejected status before persistence',async()=>{
    const w=world();await expect(markGrowthPosted(w.db,{...w.input,sha256:'b'.repeat(64)},'owner')).rejects.toThrow('STALE_OR_UNREADY_ASSET');
    w.item.channels[0].status='REJECTED';await expect(markGrowthPosted(w.db,w.input,'owner')).rejects.toThrow('POSTING_NOT_ALLOWED');
    expect(w.calls.some(c=>c.sql.startsWith('INSERT'))).toBe(false);
  });
});
