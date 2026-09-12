import {describe,it,expect,vi} from 'vitest';
import {assertMappingConsistency,persistSnapshot,startOddsJob} from './ingestion';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {OddsSnapshot} from './types';

describe('odds ingestion integrity and recovery',()=>{
  it('accepts repeated identical identities, not conflicting identities within one response',()=>{
    const team={type:'TEAM',external:'p1',internal:'c1'};
    expect(()=>assertMappingConsistency([team,team,{...team,type:'FIXTURE'}])).not.toThrow();
    expect(()=>assertMappingConsistency([team,{...team,internal:'c2'}])).toThrow('ODDS_IDENTITY_CONFLICT');
    expect(()=>assertMappingConsistency([team,{...team,external:'p2'}])).toThrow('ODDS_IDENTITY_CONFLICT');
  });
  it('does not create a duplicate worker while an unexpired job exists',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[],rowCount:0});
    query.mockResolvedValueOnce({rows:[],rowCount:1}).mockResolvedValueOnce({rows:[],rowCount:0}).mockResolvedValueOnce({rows:[{id:'active'}],rowCount:1});
    const db={transaction:(work:(tx:QueryExecutor)=>Promise<unknown>)=>work({query}),query,close:vi.fn()} as DatabaseClient;
    await expect(startOddsJob(db)).rejects.toThrow('ODDS_WORKER_ALREADY_RUNNING');
    expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_sync_jobs'))).toBe(false);
  });
  it('preserves a replayable snapshot before a failed quote transaction and rejects lost leases',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[],rowCount:1});
    const txQuery=vi.fn().mockResolvedValue({rows:[],rowCount:0});
    const db={query,transaction:(work:(tx:QueryExecutor)=>Promise<unknown>)=>work({query:txQuery}),close:vi.fn()} as DatabaseClient;
    const snapshot:OddsSnapshot={bookmaker:'betano.bet.br',observedAt:'2026-09-12T10:00:00Z',tournamentIds:['325'],fixtures:[],quotes:[],rejected:{}};
    await expect(persistSnapshot(db,'expired',snapshot)).rejects.toThrow('ODDS_WORKER_LEASE_LOST');
    expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0][0]).toContain('INSERT INTO odds_sync_snapshots');
    expect(txQuery).toHaveBeenCalledTimes(1);expect(txQuery.mock.calls[0][0]).toContain('lease_expires_at>now()');
  });
});
