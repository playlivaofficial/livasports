import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {SportsSitemapRepository,sitemapPlayerEligibilitySql} from './sitemap-repository';
import type {QueryExecutor} from '@/database/client';
describe('bounded player sitemap queries',()=>{
  it('keeps squad/content eligibility but avoids sorting all statistics on every batch',async()=>{
    const query=vi.fn(async()=>({rows:[]}));await new SportsSitemapRepository({query:query as unknown as QueryExecutor['query']}).entries('players',500,48500);
    expect(query).toHaveBeenCalledTimes(1);const [sql,values]=query.mock.calls[0] as unknown as [string,number[]];
    expect(sql).toContain('page AS MATERIALIZED');expect(sql).toContain('LIMIT $1 OFFSET $2');expect(values).toEqual([500,48500]);
    expect(sitemapPlayerEligibilitySql).not.toContain('UNION');expect(sitemapPlayerEligibilitySql).toContain('sm.player_id=p.id');
    expect(sql).toContain('SELECT max(fps.observed_at)');expect(sql).toContain("'SUPPORTED_BUT_NO_CURRENT_FIXTURES'");
  });
});

describe('M1 submitted eligibility',()=>{
  const capture=async(kind:'matches'|'teams')=>{
    const query=vi.fn(async()=>({rows:[]}));
    await new SportsSitemapRepository({query:query as unknown as QueryExecutor['query']}).entries(kind,500,0);
    return (query.mock.calls[0] as unknown as [string])[0];
  };
  it('bounds submitted fixtures to the policy kickoff window',async()=>{
    const sql=await capture('matches');
    expect(sql).toContain("f.kickoff>=now()-interval '30 days'");
    expect(sql).toContain("f.kickoff<=now()+interval '45 days'");
    // Aging out is a submission rule only: nothing here deletes or 404s a fixture.
    expect(sql).not.toMatch(/DELETE|DROP/i);
  });
  it('requires real coverage, not just a routed competition, for fixtures and teams',async()=>{
    for(const kind of ['matches','teams'] as const){
      const sql=await capture(kind);
      expect(sql).toContain("c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')");
      expect(sql).toContain('c.enabled');
    }
  });
  it('still excludes pending draws and placeholder teams',async()=>{
    expect(await capture('matches')).toContain('sports_pending_fixtures');
    expect(await capture('teams')).toContain('NOT t.provider_placeholder');
  });
  it('does not apply the kickoff window to team profiles, which are not time-bound inventory',async()=>{
    expect(await capture('teams')).not.toContain("interval '45 days'");
  });
});
