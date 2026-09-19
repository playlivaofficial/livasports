import {describe,it,expect,vi} from 'vitest';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {pruneLaunchTelemetry} from './maintenance';
describe('bounded launch telemetry retention',()=>{
  it('never deletes current product records and caps each expired batch',async()=>{
    const query=vi.fn(async()=>({rows:[{name:'claimed'}],rowCount:1}));const typed=query as unknown as QueryExecutor['query'];
    const db={query:typed,transaction:async work=>work({query:typed}),close:async()=>{}} as DatabaseClient;
    expect(await pruneLaunchTelemetry(db)).toEqual({events:1,sessions:1,quality:1,emailLimits:1,requests:1,tests:1});
    const sql=query.mock.calls.map(c=>String((c as unknown[])[0]));const deletes=sql.filter(s=>s.startsWith('DELETE'));
    expect(deletes).toHaveLength(6);for(const s of deletes){expect(s).toContain('LIMIT 5000');expect(s).toContain('now()-interval');expect(s).not.toMatch(/DELETE FROM (fixtures|teams|users|user_sessions|affiliate_clicks|odds_current)/);}
    expect(sql[0]).toContain("interval '1 hour'");
  });
  it('skips overlapping/hourly repeats without a deletion',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));const db={query,transaction:vi.fn(),close:vi.fn()} as unknown as DatabaseClient;
    expect(await pruneLaunchTelemetry(db)).toBeNull();expect(db.transaction).not.toHaveBeenCalled();
  });
});
