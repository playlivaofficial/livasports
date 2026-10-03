import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {SportsSitemapRepository,sitemapPlayerEligibilitySql} from './sitemap-repository';
import type {QueryExecutor} from '@/database/client';
import {sitemapEntriesXml} from './sitemap';
describe('bounded player sitemap queries',()=>{
  it('keeps squad/content eligibility but avoids sorting all statistics on every batch',async()=>{
    const query=vi.fn(async()=>({rows:[]}));await new SportsSitemapRepository({query:query as unknown as QueryExecutor['query']}).entries('players',500,48500);
    expect(query).toHaveBeenCalledTimes(1);const [sql,values]=query.mock.calls[0] as unknown as [string,number[]];
    expect(sql).toContain('page AS MATERIALIZED');expect(sql).toContain('LIMIT $1 OFFSET $2');expect(values).toEqual([500,48500]);
    expect(sitemapPlayerEligibilitySql).not.toContain('UNION');expect(sitemapPlayerEligibilitySql).toContain('sm.player_id=p.id');
    expect(sql).toContain('SELECT max(fps.observed_at)');expect(sql).toContain("'SUPPORTED_BUT_NO_CURRENT_FIXTURES'");
  });
});

describe('per-locale SEO state does not leak across countries',()=>{
  const read=async(states:unknown[],kickoff:string,status='FINISHED')=>{
    const query=vi.fn<(sql:string)=>Promise<{rows:Record<string,unknown>[]}>>().mockResolvedValue({rows:[{public_id:'0123456789abcdef',name:'América',away:'Atlético Nacional',kickoff,status,seo_states:states}]});
    return {rows:await new SportsSitemapRepository({query} as unknown as QueryExecutor).entries('matches'),query};
  };
  it('a retained BR historical page does not resurrect MX, CO, PE or English',async()=>{
    const {rows,query}=await read([{locale:'br',state:'PUBLISHED',retain:true,changed:'2026-01-02T00:00:00Z'}],'2026-01-01T00:00:00Z');
    expect(rows[0].locales).toEqual(['br']);expect(rows[0].alternateLocales).toEqual(['br']);
    const xml=sitemapEntriesXml('matches',rows);expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).not.toMatch(/hreflang="(es-MX|es-CO|es-PE|en|x-default)"/);
    expect(String(query.mock.calls[0]?.[0])).toContain('jsonb_agg');
  });
  it('one GEO exclusion cannot remove other eligible locale URLs or spoof their lastmod',async()=>{
    const {rows}=await read([{locale:'mx',state:'PRODUCT_ONLY',retain:false},{locale:'co',state:'PUBLISHED',retain:true,changed:'2026-10-01T00:00:00Z'}],new Date().toISOString(),'SCHEDULED');
    expect(rows[0].locales).toEqual(['br','co','pe','en']);
    const xml=sitemapEntriesXml('matches',rows);expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);expect(xml).toContain('<loc>https://livasports.com/co/partido/');
    expect(xml).not.toContain('<loc>https://livasports.com/mx/partido/');
    expect(rows[0].lastmodByLocale).toEqual({co:'2026-10-01T00:00:00.000Z'});
  });
  it('retained MX and PE pages link reciprocally without claiming retained English',async()=>{
    const states=['mx','pe'].map(locale=>({locale,state:'PUBLISHED',retain:true,changed:'2026-01-02T00:00:00Z'}));
    const {rows}=await read(states,'2026-01-01T00:00:00Z');
    expect(rows[0].locales).toEqual(['mx','pe']);expect(rows[0].alternateLocales).toEqual(['mx','pe']);
    const xml=sitemapEntriesXml('matches',rows);expect(xml.match(/hreflang=/g)).toHaveLength(4);expect(xml).not.toContain('x-default');
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
