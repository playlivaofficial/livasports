import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./repository',()=>({recordSeoDecision:vi.fn()}));
import {recordSeoDecision} from './repository';
import {optimizeSeoClusters} from './feedback';
import type {QueryExecutor} from '@/database/client';

function database(days:number,aged:unknown[]=[]){
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('count(DISTINCT day)')?[{days}]:sql.includes('FROM seo_autopilot_pages p')?aged:
    sql.includes('SELECT boost')?[{boost:0,evaluated_week:'2026-09-28'}]:[]}));
  return {db:{query} as unknown as QueryExecutor,query};
}
describe('bounded historical and weekly feedback',()=>{
  it('does not treat missing GSC days as zero demand',async()=>{const {db,query}=database(11);await optimizeSeoClusters(db,'run',new Date('2026-09-29T12:00:00Z'));expect(query.mock.calls.some(([q])=>q.includes('FROM seo_autopilot_pages p'))).toBe(false);});
  it('does not reapply a weekly boost because of timezone parsing',async()=>{const {db,query}=database(11);await optimizeSeoClusters(db,'run',new Date('2026-09-29T12:00:00Z'));expect(query.mock.calls.some(([q])=>q.includes('INSERT INTO seo_autopilot_clusters'))).toBe(false);});
  it('keeps strategic and historically useful pages while excluding only an aged low-value sitemap entry',async()=>{
    vi.mocked(recordSeoDecision).mockClear();const {db,query}=database(28,[{fixture_id:'low',url:'low',score:20,impressions:0,historical_clicks:0},
      {fixture_id:'strategic',url:'strategic',score:80,impressions:0,historical_clicks:0},{fixture_id:'historic',url:'historic',score:20,impressions:0,historical_clicks:2}]);
    await optimizeSeoClusters(db,'run',new Date('2026-09-29T12:00:00Z'));
    expect(query.mock.calls.filter(([q])=>q.startsWith('UPDATE'))).toHaveLength(1);
    expect(vi.mocked(recordSeoDecision).mock.calls.map(c=>c[3])).toEqual(['EXCLUDE_FROM_SITEMAP','RETAIN_STRATEGIC','RETAIN_STRATEGIC']);
    expect(query.mock.calls.every(([q])=>!/(DELETE|TRUNCATE|DROP)/.test(q))).toBe(true);
  });
});
