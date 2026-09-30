import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {upsertGrowthSeoPriorities} from './repository';
import type {DatabaseClient} from '@/database/client';
describe('selection-only transaction',()=>{
  it('serializes lightweight updates without any video job, asset, lease or heartbeat writes',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));const db={transaction:async(fn:(tx:unknown)=>unknown)=>fn({query})} as DatabaseClient;
    await upsertGrowthSeoPriorities(db,[]);
    const sql=query.mock.calls.map(call=>String((call as unknown[])[0])).join('\n');
    expect(sql).toContain('pg_advisory_xact_lock');expect(sql).toContain('UPDATE growth_seo_priorities');
    expect(sql).not.toMatch(/growth_generation_jobs|growth_content_items|growth_canonical_assets|growth_voice_clips|growth_platform_assets|heartbeat|lease/);
  });
  it('does not overwrite a newer committed ranking with an older overlapping run',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT 1')?[{exists:1}]:[],rowCount:0}));
    const db={transaction:async(fn:(tx:unknown)=>unknown)=>fn({query})} as DatabaseClient;
    await upsertGrowthSeoPriorities(db,[],new Date('2026-09-30T10:00:00Z'));
    expect(query).toHaveBeenCalledTimes(2);expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
  });
});
