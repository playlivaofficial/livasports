import {describe,expect,it,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import {feedsForProvider,readVerifiedOperatorFeeds} from './operator-feeds';

const row=(geo='CO',operator='betsson',provider='betsson.co')=>({geo,operator_id:operator,provider_bookmaker_id:provider,source_domains:[provider]});
const dbFor=(rows:unknown[])=>({query:vi.fn(async()=>({rows,rowCount:rows.length}))});
describe('verified country-specific provider feeds',()=>{
  it('requires exact country technical/legal verification, independently of affiliate approval',async()=>{
    const db=dbFor([row()]);
    expect(await readVerifiedOperatorFeeds(db as unknown as QueryExecutor)).toEqual([{geo:'CO',operatorId:'betsson',providerBookmakerId:'betsson.co',sourceDomains:['betsson.co']}]);
    const [[sql]]=db.query.mock.calls as unknown as Array<[string]>;
    expect(sql).toContain("p.provider='ODDSPAPI'");expect(sql).toContain("g.verification_state IN ('VERIFIED','VERIFIED_'||c.iso2)");
    expect(sql).toContain('g.country_id=c.id');expect(sql).toContain('g.legal_verified_at IS NOT NULL');expect(sql).toContain("NULLIF(trim(g.legal_reference),'') IS NOT NULL");
    expect(sql).toContain('p.verified_at IS NOT NULL');expect(sql).toContain("g.legal_status='VERIFIED'");
    expect(sql).toContain('g.sportsbook_enabled AND g.odds_enabled AND g.comparison_enabled');
    expect(sql).not.toMatch(/affiliate_enabled|commercial_status/);
  });
  it('does not accept BR, unknown countries, hidden insurance, invalid IDs or missing domain evidence',async()=>{
    const db=dbFor([row('BR'),row('ROW'),row('CO','betano.bet.br'),row('CO','betsson','../../bad'),{...row(),source_domains:[]}]);
    expect(await readVerifiedOperatorFeeds(db as unknown as QueryExecutor)).toEqual([]);
  });
  it('keeps one operators country feeds separate and refuses one provider ID assigned to different operators',async()=>{
    const db=dbFor([row('CO','betsson','betsson.co'),row('PE','betsson','betsson.pe')]);
    const feeds=await readVerifiedOperatorFeeds(db as unknown as QueryExecutor);
    expect(feedsForProvider(feeds,'betsson.pe').map(feed=>feed.geo)).toEqual(['PE']);
    expect(feedsForProvider(feeds,'betsson')).toEqual([]);
    const conflicting=dbFor([row('CO','betsson','shared'),row('PE','betano','shared')]);
    await expect(readVerifiedOperatorFeeds(conflicting as unknown as QueryExecutor)).rejects.toThrow('ODDS_AMBIGUOUS_OPERATOR_FEED');
  });
});
