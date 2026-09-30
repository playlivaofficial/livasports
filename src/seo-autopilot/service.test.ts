import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({acquire:vi.fn(),inventory:vi.fn(),record:vi.fn(),crawl:vi.fn(),sitemaps:vi.fn(),feedback:vi.fn()}));
vi.mock('./repository',()=>({acquireSeoRun:mocks.acquire,readSeoInventory:mocks.inventory,recordSeoDecision:mocks.record}));
vi.mock('./crawl',()=>({crawlSeoUrl:mocks.crawl}));
vi.mock('./sitemaps',()=>({maintainSeoSitemaps:mocks.sitemaps}));
vi.mock('./optimization',()=>({runGrowthOptimization:mocks.feedback}));
import {runSeoAutopilot} from './service';
import {testSignals,testNow} from '@/growth/fixtures.test-support';
import {matchPath} from '@/localization/interface';
import type {DatabaseClient} from '@/database/client';

function candidates(){return Array.from({length:8},(_,i)=>{
  const signals=testSignals({fixtureId:`00000000-0000-4000-8000-00000000000${i}`,publicId:`111111111111111${i}`});
  const destinationUrl='https://livasports.com'+matchPath('br',signals.publicId,signals.home.name,signals.away.name);
  return {signals,destinationUrl,score:{total:80,tier:'A'},row:{has_experiment:true},evidence:{brazil:true,impressions:30,clicks:1,relatedImpressions:0,queryImpressions:0,
    uniqueSignals:['fixture','venue','form'],fresh:true,shortlisted:true,inboundSources:0,clusterBoost:0}};
});}
function database(publishedToday=0){
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('SELECT count(*)')?[{n:sql.includes('FROM seo_autopilot_pages')?publishedToday:0}]:[]}));
  const db={query,transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>fn({query}),close:async()=>undefined};
  return {db:db as unknown as DatabaseClient,query};
}
beforeEach(()=>{
  vi.clearAllMocks();mocks.acquire.mockResolvedValue('run');mocks.inventory.mockResolvedValue(candidates());mocks.feedback.mockResolvedValue({mode:'ACTIVE',changed:0});mocks.sitemaps.mockResolvedValue([]);
  mocks.crawl.mockImplementation(async(url:string)=>({url,status:200,title:url,h1:'Fixture',canonical:url,indexFollow:true,primaryLength:900,structuredDataValid:true,
    alternates:[{lang:'pt-BR',href:url}],links:candidates().map(c=>c.destinationUrl),problems:[]}));
});
describe('bounded autonomous execution',()=>{
  it('starts the sitemap lease after elapsed SEO processing, with only the remaining runtime budget',async()=>{
    let elapsed=0;const clock=vi.spyOn(Date,'now').mockImplementation(()=>testNow.getTime()+elapsed);
    mocks.feedback.mockImplementation(async()=>{elapsed=190000;return {mode:'ACTIVE',changed:0};});
    try{
      await runSeoAutopilot(database().db,{now:testNow});
      expect(mocks.sitemaps.mock.calls[0][1]).toEqual(new Date(testNow.getTime()+190000));
      expect(mocks.sitemaps.mock.calls[0][4]).toEqual({budgetMs:85000});
    }finally{clock.mockRestore();}
  });
  it('an unexpected sitemap persistence failure cannot cancel successful SEO work',async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>undefined);mocks.sitemaps.mockRejectedValue(Error('private credential'));
    const r=await runSeoAutopilot(database().db,{now:testNow});expect(r.state).toBe('SUCCEEDED');expect('published' in r?r.published:null).toBe(5);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private credential');log.mockRestore();
  });
  it('a contained Google submission failure does not stop page publication',async()=>{
    mocks.sitemaps.mockResolvedValue([{path:'/sitemap.xml',state:'SCOPE_INSUFFICIENT'}]);
    const r=await runSeoAutopilot(database().db,{now:testNow});expect(r.state).toBe('SUCCEEDED');expect('published' in r?r.published:null).toBe(5);expect(r.providerRequests).toBe(0);
  });
  it('publishes at most five canonical pages, preserves V1/social/provider tables, and logs decisions',async()=>{
    const {db,query}=database();const r=await runSeoAutopilot(db,{now:testNow,maintainSitemaps:false});
    if(!('published' in r))throw Error('EXPECTED_COMPLETED_RUN');
    expect(r.state).toBe('SUCCEEDED');expect(r.published).toBe(5);expect(r.providerRequests).toBe(0);
    expect(r.outcomes?.filter(o=>o.reasons.includes('DAILY_PUBLICATION_CAP'))).toHaveLength(3);
    expect(mocks.record).toHaveBeenCalledTimes(8);
    expect(query.mock.calls.filter(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql)).every(([sql])=>sql.includes('seo_autopilot_'))).toBe(true);
  });
  it('persisted daily counts protect against retries creating more pages',async()=>{const {db}=database(5);const r=await runSeoAutopilot(db,{now:testNow,maintainSitemaps:false});expect('published' in r?r.published:null).toBe(0);});
  it('does not start a second overlapping worker',async()=>{mocks.acquire.mockResolvedValue(null);expect((await runSeoAutopilot(database().db)).state).toBe('ALREADY_RUNNING');expect(mocks.crawl).not.toHaveBeenCalled();});
  it('never publishes on a failed HTML request',async()=>{mocks.crawl.mockRejectedValue(Error('network'));const r=await runSeoAutopilot(database().db,{now:testNow,maintainSitemaps:false});expect('published' in r?r.published:null).toBe(0);});
  it('deduplicates shared team/competition crawls',async()=>{await runSeoAutopilot(database().db,{now:testNow,maintainSitemaps:false});const urls=mocks.crawl.mock.calls.map(c=>c[0]);expect(new Set(urls).size).toBe(urls.length);expect(urls.length).toBe(11);});
  it('records a bounded failure without echoing thrown credentials or raw errors',async()=>{mocks.inventory.mockRejectedValue(Error('private error text'));const r=await runSeoAutopilot(database().db);expect(r.state).toBe('FAILED');expect(JSON.stringify(r)).not.toContain('private error text');});
});
