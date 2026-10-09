import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
import {buildGeoSearchBaselines,readGeoSearchBaselines} from './geo-baseline';
import {GeoSearchBaselines} from '@/owner/GeoSearchBaselines';
import type {QueryExecutor} from '@/database/client';

const now=new Date('2026-10-09T12:00:00Z');
const coverage=[{from_day:'2026-08-12',to_day:'2026-10-06'}];
const breakdowns=['COUNTRY','QUERY','DEVICE'].map(dimension=>({...coverage[0],dimension}));
const row=(dimension:string,key:string,impressions=100,clicks=2,extra={})=>({day:'2026-10-05',dimension,key,impressions,clicks,ctr:clicks/impressions,position:8,...extra});
describe('independent GEO search baselines',()=>{
 it('separates regional URL intent, Google country, their intersection and device data',()=>{
  const b=buildGeoSearchBaselines([row('PAGE','https://livasports.com/mx',100,2),row('COUNTRY','mex',500,10),row('PAGE','https://livasports.com/co',15,0)],
   [row('COUNTRY','mex',60,1,{page:'https://livasports.com/mx'}),row('DEVICE','MOBILE',80,2,{page:'https://livasports.com/mx'}),row('QUERY','liga mx',20,0,{page:'https://livasports.com/mx'})],coverage,breakdowns,now);
  expect(b.map(r=>r.geo)).toEqual(['MX','CO','PE']);
  expect(b[0].windows.map(w=>w.days)).toEqual([7,14,28]);
  expect(b[0].windows[0]).toMatchObject({from:'2026-09-30',to:'2026-10-06',complete:true,observedDays:1,localeIntent:{impressions:100},visitorCountry:{impressions:500},localPagesInCountry:{impressions:60},mobile:{impressions:80}});
  expect(b[0].windows[2].topQueries[0].key).toBe('liga mx');
  expect(b[1].windows[2].visitorCountry).toBeNull();expect(b[1].windows[2].localeIntent?.clicks).toBe(0);
  expect(b[2].windows[2].localeIntent).toBeNull();
 });
 it('never interprets an incomplete report as zero traffic or a comparable previous window',()=>{
  const b=buildGeoSearchBaselines([row('PAGE','https://livasports.com/mx')],[],[{from_day:'2026-10-01',to_day:'2026-10-06'}],[],now)[0];
  expect(b.windows[0].complete).toBe(false);expect(b.windows[0].localeIntent).toBeNull();expect(b.windows[0].previousLocaleIntent).toBeNull();
 });
 it('honors dimension-specific report coverage and Google privacy suppression',()=>{
  const b=buildGeoSearchBaselines([row('PAGE','https://livasports.com/pe')],[row('QUERY','private query',10,1,{page:'https://livasports.com/pe'}),row('DEVICE','MOBILE',50,1,{page:'https://livasports.com/pe'})],coverage,[],now)[2];
  expect(b.windows[2].topQueries).toEqual([]);expect(b.windows[2].mobile).toBeNull();expect(b.windows[2].localeIntent?.impressions).toBe(100);
 });
 it('accepts query-string regional home URLs but rejects foreign origins and prefix collisions',()=>{
  const b=buildGeoSearchBaselines([row('PAGE','https://livasports.com/mx?date=2026-10-05',50),row('PAGE','https://other.example/mx',1000),row('PAGE','https://livasports.com/mxevil',1000),row('PAGE','https://livasports.com/br',1000)],[],coverage,[],now)[0];
  expect(b.windows[2].localeIntent?.impressions).toBe(50);
 });
 it('uses impression-weighted position and recomputed CTR',()=>{
  const b=buildGeoSearchBaselines([row('PAGE','https://livasports.com/mx',100,1,{position:2}),row('PAGE','https://livasports.com/mx/futbol',300,3,{position:10})],[],coverage,[],now)[0];
  expect(b.windows[2].localeIntent).toMatchObject({ctr:.01,position:8});
 });
 it('reads in four bounded bulk queries with no Google/provider fetch or mutation',async()=>{
  const query=vi.fn(async(sql:string,values?:readonly unknown[])=>{void sql;void values;return {rows:[]};});await readGeoSearchBaselines({query} as unknown as QueryExecutor,'sc-domain:livasports.com',now);
  expect(query).toHaveBeenCalledTimes(4);
  expect(query.mock.calls.every(args=>String(args[0]).startsWith('SELECT'))).toBe(true);
  expect(query.mock.calls.map(args=>String(args[0])).join(' ')).toContain('NOT truncated');
 });
 it('renders honest unavailable states and independent 7/14/28 windows',()=>{
  const html=renderToStaticMarkup(<GeoSearchBaselines baselines={buildGeoSearchBaselines([],[],[],[],now)}/>);
  expect(html).toContain('incomplete fetch coverage');expect(html).toContain('No complete reported sample');expect(html).toContain('Google searcher country');
  expect(html).toContain('28 days');expect(html).not.toContain('0 clicks');
 });
});
