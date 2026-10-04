import {describe,expect,it,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import {readGeoPriorityRanks} from './priority-read';

describe('lightweight persisted priority read',()=>{
  it('reads the same GEO snapshot with live/kickoff/horizon guards, not a second score',async()=>{
    const query=vi.fn(async()=>({rows:[{fixture_id:'canonical-id',priority_rank:2}],rowCount:1}));
    const now=new Date('2026-10-04T12:00:00Z');
    expect(await readGeoPriorityRanks({query} as unknown as QueryExecutor,'PE',now)).toEqual(new Map([['canonical-id',2]]));
    const [[sql,args]]=query.mock.calls as unknown as Array<[string,unknown[]]>;
    expect(args).toEqual(['PE',now]);expect(sql).toContain("f.status='SCHEDULED'");expect(sql).toContain('f.kickoff>$2');
    expect(sql).toContain("interval '7 days'");expect(sql).toContain('LIMIT 5');
  });
});
