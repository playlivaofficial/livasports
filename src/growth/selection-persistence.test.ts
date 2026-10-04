import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readGrowthFixtures,upsertGrowthSeoPriorities} from './repository';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
describe('selection-only transaction',()=>{
  it('reads only the 32 standalone acquisition competitions, not historical or playoff child inventory',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    await readGrowthFixtures({query} as unknown as QueryExecutor,new Date('2026-10-04T12:00:00Z'),'CO');
    const [[sql,params]]=query.mock.calls as unknown as Array<[string,unknown[]]>;
    expect(params[2]).toHaveLength(32);expect(params[2]).not.toContain('saudi-pro-league-playoffs');expect(params[2]).not.toContain('brasileirao-serie-b');
    expect(sql).toContain("f.status='SCHEDULED'");expect(sql).toContain('f.kickoff>$1');expect(sql).toContain('NOT ht.provider_placeholder');
  });
  it('serializes lightweight updates without any video job, asset, lease or heartbeat writes',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));const db={transaction:async(fn:(tx:unknown)=>unknown)=>fn({query})} as DatabaseClient;
    await upsertGrowthSeoPriorities(db,[]);
    const sql=query.mock.calls.map(call=>String((call as unknown[])[0])).join('\n');
    expect(sql).toContain('pg_advisory_xact_lock');expect(sql).toContain('UPDATE growth_geo_priorities');
    expect(sql).not.toContain('growth_seo_priorities');
    expect(sql).not.toMatch(/growth_generation_jobs|growth_content_items|growth_canonical_assets|growth_voice_clips|growth_platform_assets|heartbeat|lease/);
  });
  it('does not overwrite a newer committed ranking with an older overlapping run',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT 1')?[{exists:1}]:[],rowCount:0}));
    const db={transaction:async(fn:(tx:unknown)=>unknown)=>fn({query})} as DatabaseClient;
    await upsertGrowthSeoPriorities(db,[],new Date('2026-09-30T10:00:00Z'));
    expect(query).toHaveBeenCalledTimes(2);expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
  });
  it('retires only the requested GEO and persists history without touching legacy media',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));const db={transaction:async(fn:(tx:unknown)=>unknown)=>fn({query})} as DatabaseClient;
    await upsertGrowthSeoPriorities(db,[],new Date('2026-10-03T12:00:00Z'),'CO');
    const calls=query.mock.calls as unknown as Array<[string,unknown[]]>;
    expect(calls[0][1]).toEqual(['growth:seo-priorities:CO']);
    const deactivate=calls.find(([sql])=>sql.startsWith('UPDATE'))!;expect(deactivate[0]).toContain('AND geo=$2');expect(deactivate[1][1]).toBe('CO');
    expect(calls.find(([sql])=>sql.includes('INSERT INTO growth_geo_selections'))?.[1][0]).toBe('CO');
  });
  it('does not add history for identical content on a repeated run',async()=>{
    const {createHash}=await import('node:crypto'),fingerprint=createHash('sha256').update('[]').digest('hex');
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT fingerprint')?[{fingerprint,current_list:[]}]:[],rowCount:0}));
    const db={transaction:async(fn:(tx:unknown)=>unknown)=>fn({query})} as DatabaseClient;
    await upsertGrowthSeoPriorities(db,[],new Date(),'PE');expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO growth_geo_selections'))).toBe(false);
  });
});
