import {describe,expect,it,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
vi.mock('server-only',()=>({}));
vi.mock('@/odds/operator-feeds',()=>({readVerifiedOperatorFeeds:async()=>[
  {geo:'CO',operatorId:'codere',providerBookmakerId:'codere-co',sourceDomains:['codere.com.co']},
  {geo:'PE',operatorId:'betano',providerBookmakerId:'betano-pe',sourceDomains:['betano.pe']},
]}));
import {readCompetitionDetail} from './health-server';

describe('owner country-specific competition detail',()=>{
  it('uses exact country quotes, feed mappings, requests and incident keys with no legacy source',async()=>{
    const query=vi.fn(async(sql:string,values?:readonly unknown[])=>{void values;return {rows:sql.startsWith('SELECT f.public_id')?[{public_id:'a'.repeat(16),kickoff:'2026-10-04T20:00:00Z',status:'SCHEDULED',home:'Home',away:'Away',quotes:[]}]:[]};});
    const fetch=vi.spyOn(globalThis,'fetch');
    const detail=await readCompetitionDetail({query} as unknown as QueryExecutor,'CO:liga-betplay','123',new Date('2026-10-04T00:00:00Z'));
    expect(detail).toMatchObject({competition:'CO:liga-betplay',geo:'CO',canonicalCompetition:'liga-betplay',requestCost:1,operatorFeeds:['codere-co']});
    const sql=query.mock.calls.map(([statement])=>statement).join('\n');
    expect(sql).toContain('FROM odds_geo_current');expect(sql).not.toContain('FROM odds_current');
    expect(sql).toContain('o.geo=$2');expect(sql).toContain('opm.provider_bookmaker_id=o.provider_bookmaker_id');
    expect(sql).toContain('g.source_domains');expect(sql).toContain("safe_query->>'bookmaker'=ANY($2::text[])");
    expect(query.mock.calls[0][1]).toEqual(['liga-betplay','CO',['codere-co']]);
    expect(query.mock.calls[1][1]).toEqual(['123',['codere-co']]);
    expect(query.mock.calls.at(-1)?.[1]).toEqual(['CO:liga-betplay']);
    expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it('does not use another country to fill an unverified pool',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});
    const detail=await readCompetitionDetail({query},'MX:liga-mx','123');
    expect(detail).toMatchObject({geo:'MX',operatorFeeds:[],requestCost:0});
    expect(query.mock.calls[0][1]).toEqual(['liga-mx','MX',[]]);
  });
  it.each(['bundesliga','BR:bundesliga','CO:league:extra'])('rejects non-core country detail %s before reading',async key=>{
    const query=vi.fn();await expect(readCompetitionDetail({query},key,null)).rejects.toThrow('INVALID_COUNTRY_COMPETITION');expect(query).not.toHaveBeenCalled();
  });
});
