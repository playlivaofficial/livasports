import {describe,it,expect,vi} from 'vitest';
import {assertMappingConsistency,persistSnapshot,snapshotAbsenceCloseScope,startOddsJob} from './ingestion';
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
  it('closes only matched snapshot fixtures, never the rest of the tournament',()=>{
    const snapshot:OddsSnapshot={bookmaker:'betano.bet.br',observedAt:'2026-09-12T10:00:00Z',tournamentIds:['325'],
      fixtures:[{providerId:'p1',sport:'FOOTBALL',competition:'brasileirao-serie-a',providerCompetitionId:'325',kickoff:'2026-09-12T19:00:00Z',status:'PREGAME',homeProviderId:'1',awayProviderId:'2',homeNames:['A'],awayNames:['B']}],
      quotes:[],rejected:{}};
    expect(snapshotAbsenceCloseScope(snapshot,['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'])).toEqual({
      bookmaker:'betano.bet.br',fixtureIds:['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],providerFixtureIds:['p1'],
    });
    expect(snapshotAbsenceCloseScope({...snapshot,bookmaker:'betano',fixtures:[]},[])).toEqual({
      bookmaker:'betano.bet.br',fixtureIds:[],providerFixtureIds:[],
    });
  });
  it('rolls back a failed post-write assertion before crediting success or applying the snapshot',async()=>{
    const query=vi.fn(async(sql:string)=>({rows:[],rowCount:sql.includes('UPDATE odds_sync_jobs')||sql.includes("classification='INGESTION_BUG' LIMIT")?1:0}));
    const typed=query as unknown as QueryExecutor['query'];
    const db:DatabaseClient={query:typed,transaction:async work=>work({query:typed}),close:async()=>{}};
    const snapshot:OddsSnapshot={bookmaker:'betsson',observedAt:new Date().toISOString(),tournamentIds:['325'],fixtures:[],quotes:[],rejected:{}};
    await expect(persistSnapshot(db,'job',snapshot)).rejects.toThrow('ODDS_PERSISTENCE_VERIFICATION_FAILED');
    expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_refresh_targets'))).toBe(false);
    expect(query.mock.calls.some(([sql])=>sql.includes('SET applied_at'))).toBe(false);
    expect(query.mock.calls.some(([sql])=>sql.includes("SET status='CLOSED'"))).toBe(false);
  });
});
