import {describe,it,expect,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import {readOddsAvailability} from './availability-read';

vi.mock('./operator-feeds',()=>({readVerifiedOperatorFeeds:vi.fn(async()=>[
  {geo:'CO',operatorId:'betsson',providerBookmakerId:'betsson'},
  {geo:'CO',operatorId:'bwin',providerBookmakerId:'bwin'},
  {geo:'PE',operatorId:'inkabet',providerBookmakerId:'inkabet'},
])}));
const dbFor=(rows:unknown[])=>({query:vi.fn(async()=>({rows,rowCount:rows.length}))});
describe('DB-only odds availability explanations',()=>{
  it('scopes one bounded read to verified GEO feeds without fetching a provider',async()=>{
    const db=dbFor([{bookmaker:'betsson',provider_error:true},{bookmaker:'bwin',confirmed_gap:true}]);
    expect(await readOddsAvailability(db as unknown as QueryExecutor,'fixture','CO')).toEqual({betsson:'PROVIDER_ERROR',bwin:'NOT_OFFERED'});
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql,args]=db.query.mock.calls[0] as unknown as [string,unknown[]];
    expect(args).toEqual(['fixture',['betsson','bwin']]);
    expect(sql).toContain('d.fixture_id=f.id AND d.bookmaker=p.bookmaker');
    expect(sql).toContain('d.observed_at=t.last_checked_at');
    expect(sql).toContain("bool_and(d.classification='PROVIDER_GAP')");
    expect(sql).toContain('count(DISTINCT (d.market,d.outcome))>=7');
    expect(sql).toContain("WHERE billable AND outcome='SUCCEEDED'");
  });
  it('keeps unknown coverage unverified and exposes no internal error or credential fields',async()=>{
    const db=dbFor([{bookmaker:'betsson',last_error:'INTERNAL_PRIVATE_DIAGNOSTIC'}]);
    expect(await readOddsAvailability(db as unknown as QueryExecutor,'fixture','CO')).toEqual({betsson:'UNVERIFIED',bwin:'UNVERIFIED'});
  });
  it('does not read quote diagnostics for an unknown GEO',async()=>{
    const db=dbFor([]);
    expect(await readOddsAvailability(db as unknown as QueryExecutor,'fixture',null)).toEqual({});
    expect(db.query).not.toHaveBeenCalled();
  });
  it('distinguishes ingestion and budget delay without asserting upstream absence',async()=>{
    const db=dbFor([{bookmaker:'betsson',last_outcome:'MAPPING_EMPTY'},{bookmaker:'bwin',quota_blocked:true}]);
    expect(await readOddsAvailability(db as unknown as QueryExecutor,'fixture','CO')).toEqual({betsson:'INGESTION_DELAY',bwin:'QUOTA_DELAY'});
  });
});
