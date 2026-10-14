import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {buildCountryDemand,fixtureCountryDemand,type CountrySearchRow} from './country-demand';
import {readCountryDemand} from './country-demand-read';
import {scoreFixture} from './scoring';
import {testSignals} from './fixtures.test-support';
import type {QueryExecutor} from '@/database/client';
const now=new Date('2026-10-14T06:00:00Z'),window={from:'2026-09-14',to:'2026-10-11',capturedAt:'2026-10-14T05:41:00Z'};
const rows:CountrySearchRow[]=Array.from({length:8},(_,i)=>({day:`2026-10-${String(i+1).padStart(2,'0')}`,page:`https://livasports.com/en/match/record-${i}`,impressions:10,clicks:i===0?1:0,competition:'liga-mx',homePublicId:'a'.repeat(16),awayPublicId:'b'.repeat(16),teamPublicId:null}));
describe('actual searcher-country demand',()=>{
 it('uses historical league/club evidence across route languages without summing overlapping fixture signals',()=>{
  const demand=buildCountryDemand('MX',rows,window,now),signal=fixtureCountryDemand(testSignals({competitionSlug:'liga-mx',home:{name:'A',slug:'a',publicId:'a'.repeat(16),imageUrl:null}}),demand);
  expect(demand.ready).toBe(true);expect(demand.impressions).toBe(80);expect(demand.clubs[0].impressions).toBe(80);
  expect(signal.strength).toBe(1);expect(signal.reason).toContain('país MX');expect(signal.reason).toContain('80 impresiones');
 });
 it('keeps sparse, stale and incomplete country reports at zero rather than inventing local interest',()=>{
  for(const demand of [buildCountryDemand('CO',rows.slice(0,2),window,now),buildCountryDemand('CO',rows,{...window,capturedAt:null},now),buildCountryDemand('CO',rows,{...window,capturedAt:'2026-10-01T00:00:00Z'},now)]){
   expect(demand.ready).toBe(false);expect(demand.competitions.every(r=>r.strength===0)).toBe(true);
  }
 });
 it('requires repeated entity evidence and matches canonical club identity, not a lookalike name',()=>{
  const demand=buildCountryDemand('PE',[...rows,{...rows[0],competition:'peru-liga-1',homePublicId:'c'.repeat(16),impressions:100}],window,now);
  expect(demand.competitions.find(r=>r.key==='peru-liga-1')?.qualified).toBe(false);
  expect(fixtureCountryDemand(testSignals({competitionSlug:'unknown',home:{name:'A',slug:'a',publicId:'d'.repeat(16),imageUrl:null},away:{name:'B',slug:'b',publicId:'e'.repeat(16),imageUrl:null}}),demand).strength).toBe(0);
 });
 it('can promote a later, locally evidenced match above an otherwise identical earlier match',()=>{
  const earlier=testSignals({competitionSlug:'liga-mx',kickoff:'2026-10-14T08:00:00Z'}),later={...earlier,fixtureId:'later',kickoff:'2026-10-18T08:00:00Z'};
  expect(scoreFixture(later,now,{geo:'MX',countrySearchStrength:1}).total).toBeGreaterThan(scoreFixture(earlier,now,{geo:'MX'}).total);
 });
 it.each([['MX','mex'],['CO','col'],['PE','per']] as const)('filters %s by actual country %s and does not infer it from URL prefix',async(geo,code)=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM seo_breakdown_syncs')?[{captured_at:window.capturedAt}]:[]}));
  await readCountryDemand({query} as unknown as QueryExecutor,geo,now);
  const page=query.mock.calls.find(([sql])=>sql.includes('FROM seo_page_breakdowns'))! as unknown as [string,unknown[]];
  expect(page[1][1]).toBe(code);expect(page[0]).toContain("dimension='COUNTRY'");expect(page[0]).toContain('lower(key)=$2');expect(page[0]).not.toContain("page LIKE 'https://livasports.com/mx/%'");
 });
 it('keeps the last complete cached window before the morning Google sync and labels its actual dates',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM seo_breakdown_syncs')?[{captured_at:'2026-10-13T05:41:00Z',from_day:'2026-09-13',to_day:'2026-10-10'}]:[]}));
  const demand=await readCountryDemand({query} as unknown as QueryExecutor,'CO',new Date('2026-10-14T05:17:00Z'));
  expect(demand.to).toBe('2026-10-10');expect(demand.from).toBe('2026-09-13');expect(demand.capturedAt).toBe('2026-10-13T05:41:00.000Z');
  const [,values]=query.mock.calls[1] as unknown as [string,string[]];expect(values.slice(2)).toEqual(['2026-09-13','2026-10-10']);
 });
 it('preserves PostgreSQL Date milliseconds used by the automatic freshness guard',async()=>{
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM seo_breakdown_syncs')?[{captured_at:new Date('2026-10-14T05:41:13.302Z'),from_day:window.from,to_day:window.to}]:[]}));
  const demand=await readCountryDemand({query} as unknown as QueryExecutor,'MX',now);expect(demand.capturedAt).toBe('2026-10-14T05:41:13.302Z');
 });
});
