import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
import {DailyGrowthStatus} from './DailyGrowthStatus';
import {finishDailyGeoRun} from './daily-repository';
import type {DailyGrowthReport} from './daily-repository';
import type {QueryExecutor} from '@/database/client';
const report:DailyGrowthReport={version:'GEO_DAILY_SEO_2',localDay:'2026-10-14',nextCheck:'2026-10-14T08:17:00Z',lastSuccess:null,runs:[],window:{from:'2026-09-14',to:'2026-10-11'},
 active:[{fixtureId:'f',rank:1,label:'Home × Away',score:86,canonicalUrl:'https://livasports.com/co/partido/home-x-away-0000000000000000',kickoff:'2026-10-15T19:00:00Z',competition:'colombia-primera-a'}],
 measurements:[{fixtureId:'f',url:'https://livasports.com/co/partido/home-x-away-0000000000000000',impressions:null,clicks:null,position:null,countryImpressions:20,countryClicks:0,organicSessions:0,organicReferrals:0}]};
describe('daily Owner evidence and measurement boundaries',()=>{
 it('distinguishes absent Google rows, measured country zeroes and organic HUMAN events',()=>{
  const html=renderToStaticMarkup(<DailyGrowthStatus report={report} geo="CO"/>);
  expect(html).toContain('Sin filas GSC');expect(html).toContain('<td>20</td><td>0</td>');expect(html).toContain('sin OWNER/QA/BOT');expect(html).toContain('no prueban crecimiento causado');
  expect(html).toContain('America/Bogota');expect(html).toContain('requiere inspección');expect(html).toContain('1 / 5 prioridades públicas válidas');
 });
 it('logs automatic checks without creating another placement or changing metadata',async()=>{
  const query=vi.fn(async()=>({rows:[]}));await finishDailyGeoRun({query} as unknown as QueryExecutor,'1',{state:'SUCCEEDED',changed:false},new Date('2026-10-14T08:17:00Z'));
  const sql=String((query.mock.calls[0] as unknown[])[0]);expect(sql).toContain('UPDATE growth_geo_runs');expect(sql).toContain("trigger_source='AUTOMATIC'");expect(sql).not.toMatch(/growth_geo_priorities|seo_geo_pages|title|description/);
 });
});
