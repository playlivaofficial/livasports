import {describe,expect,it,vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import type {OddsSnapshot} from './types';
import {persistGeoSnapshotQuotes} from './geo-persistence';
import {readFileSync} from 'node:fs';

const observedAt='2026-10-04T12:00:00Z';
const quote={fixtureId:'11111111-1111-4111-8111-111111111111',bookmaker:'betsson',providerFixtureId:'p1',market:'MATCH_WINNER' as const,outcome:'HOME' as const,line:null,
  decimalOdds:'2.1',status:'ACTIVE' as const,scope:'FULL_TIME_REGULATION' as const,phase:'PREGAME' as const,providerUpdatedAt:observedAt,observedAt,
  sourceDomain:'betsson.co',providerKickoff:'2026-10-04T18:00:00Z',freshnessTtlMinutes:15};
const feed={geo:'CO' as const,operatorId:'betsson',providerBookmakerId:'betsson.co',sourceDomains:['betsson.co']};
const snapshot:OddsSnapshot={bookmaker:'betsson',provider:'ODDSPAPI',providerBookmakerId:'betsson.co',geoFeeds:[feed],observedAt,fixtures:[],quotes:[quote],rejected:{},tournamentIds:[]};
const dbFor=(feeds=[feed])=>({query:vi.fn(async(sql:string)=>{
  if(sql.startsWith('SELECT c.iso2'))return {rows:feeds.map(f=>({geo:f.geo,operator_id:f.operatorId,provider_bookmaker_id:f.providerBookmakerId,source_domains:f.sourceDomains})),rowCount:feeds.length};
  if(sql.includes('SELECT (SELECT count(*) FROM history)'))return {rows:[{history_changes:1,current_writes:1}],rowCount:1};
  return {rows:[],rowCount:0};
})});

describe('country-isolated odds persistence contract',()=>{
  it('fails closed before any mutation for absent or revoked verified feed identities',async()=>{
    for(const value of [{...snapshot,providerBookmakerId:undefined},{...snapshot,geoFeeds:[]},snapshot]){
      const db=dbFor([]);
      await expect(persistGeoSnapshotQuotes(db as unknown as QueryExecutor,value,[quote],[])).rejects.toThrow('ODDS_GEO_FEED_UNVERIFIED');
      expect(db.query.mock.calls.every(([sql])=>sql.startsWith('SELECT c.iso2'))).toBe(true);
    }
  });
  it('isolates current and history writes by country, source and exact provider feed',async()=>{
    const db=dbFor();
    expect(await persistGeoSnapshotQuotes(db as unknown as QueryExecutor,snapshot,[quote],[])).toEqual({history_changes:1,current_writes:1,closed:0});
    const calls=db.query.mock.calls as unknown as Array<[string,unknown[]]>;
    const [sql,params]=calls.find(([text])=>text.includes('SELECT (SELECT count(*) FROM history)'))!;
    expect(JSON.parse(String(params[0]))).toEqual([{...quote,geo:'CO'}]);expect(params[1]).toBe('betsson.co');
    expect(sql).toContain('ON CONFLICT(geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id');
    expect(sql).toContain('o.geo=i.geo');expect(sql).toContain('o.provider_bookmaker_id=$2');
    expect(sql).toContain('o.observed_at<=i."observedAt"');
    expect(sql).toContain('(o.decimal_odds,o.status) IS DISTINCT FROM');
    expect(sql).toContain('odds_geo_current.observed_at<excluded.observed_at');
    expect(calls.map(([text])=>text).join('\n')).not.toMatch(/INSERT INTO odds_current\b|INSERT INTO odds_history\b/);
  });
  it('rejects a changed country domain or bookmaker before overwriting current prices or withdrawing old ones',async()=>{
    for(const invalid of [{...quote,sourceDomain:'betsson.pe'},{...quote,sourceDomain:null},{...quote,sourceDomain:'betsson.co.evil.example'},
      {...quote,sourceDomain:'https://betsson.co'},{...quote,bookmaker:'betano'}]){
      const db=dbFor();
      await expect(persistGeoSnapshotQuotes(db as unknown as QueryExecutor,snapshot,[invalid],[quote.fixtureId])).rejects.toThrow('ODDS_GEO_SOURCE_UNVERIFIED');
      expect(db.query).toHaveBeenCalledTimes(1);
    }
    const db=dbFor();
    await expect(persistGeoSnapshotQuotes(db as unknown as QueryExecutor,snapshot,[{...quote,sourceDomain:'www.betsson.co'}],[])).resolves.toMatchObject({current_writes:1});
  });
  it('does not withdraw old prices for empty/unvalidated snapshots; close scope is exact and geo-isolated',async()=>{
    const empty=dbFor();await persistGeoSnapshotQuotes(empty as unknown as QueryExecutor,snapshot,[],[]);
    expect(empty.query.mock.calls.some(([sql])=>sql.includes("SET status='CLOSED'"))).toBe(false);
    const db=dbFor();await persistGeoSnapshotQuotes(db as unknown as QueryExecutor,snapshot,[quote],[quote.fixtureId]);
    const [sql,args]=(db.query.mock.calls as unknown as Array<[string,unknown[]]>).find(([text])=>text.includes("SET status='CLOSED'"))!;
    expect(args.slice(0,4)).toEqual([['CO'],'betsson.co',[quote.fixtureId],observedAt]);
    expect(sql).toContain('o.observed_at<=$4');expect(sql).toContain('NOT EXISTS');expect(sql).toContain('q.line IS NOT DISTINCT FROM o.line');
  });
  it('enforces per-country uniqueness without changing historical BR price tables',()=>{
    const sql=readFileSync(new URL('../../db/migrations/061_geo_odds.sql',import.meta.url),'utf8');
    expect(sql).toContain("geo IN ('MX','CO','PE')");
    expect(sql).toContain('(geo,source_provider,provider_bookmaker_id,fixture_id,bookmaker_id,market_code,outcome_code');
    expect(sql).not.toMatch(/ALTER TABLE odds_current|DELETE|DROP TABLE/);
  });
});
