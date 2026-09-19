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
