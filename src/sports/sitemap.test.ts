import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('./sitemap-runtime',()=>({loadSitemapCounts:vi.fn(),loadSitemapBatch:vi.fn()}));
import {loadSitemapBatch,loadSitemapCounts} from './sitemap-runtime';
import {parseSitemapBatch,sitemapBatches,sitemapEntriesXml,sitemapIndexXml,sitemapBatchSize} from './sitemap';
import {GET as index} from '@/app/sports-sitemaps.xml/route';
import {GET as batch} from '@/app/sports-sitemaps/[batch]/route';
import robots from '@/app/robots';
const entries=[{publicId:'0123456789abcdef',name:'A & B <FC>',away:'C "FC"',updatedAt:new Date('2026-09-14T00:00:00Z')}];
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
describe('complete bounded sports sitemaps',()=>{
  it('covers every entity beyond old limits with bounded batches and no empty trailing page',()=>{
    const names=sitemapBatches({matches:5001,teams:1000,players:10001});
    expect(names).toHaveLength(34);expect(names).toContain('matches-10.xml');expect(names).toContain('players-20.xml');expect(names).not.toContain('teams-2.xml');
    expect(sitemapBatches({matches:0,teams:0,players:0})).toEqual([]);
    expect(sitemapIndexXml({matches:1,teams:0,players:0})).toContain('https://livasports.com/sports-sitemaps/matches-0.xml');
  });
  it.each(['players--1.xml','teams-01.xml','matches-1','odds-0.xml','players-9007199254740992.xml','../matches-0.xml'])('rejects an invalid batch: %s',input=>expect(parseSitemapBatch(input)).toBeNull());
  it.each(['matches','teams','players'] as const)('serializes reciprocal locale links and real modification dates for %s',kind=>{
    const content=sitemapEntriesXml(kind,entries);
    expect(content.match(/<url>/g)).toHaveLength(3);expect(content.match(/hreflang=/g)).toHaveLength(12);
    expect(content.match(/hreflang="x-default" href="https:\/\/livasports.com\/en\//g)).toHaveLength(3);
    expect(content.match(/<lastmod>2026-09-14T00:00:00.000Z<\/lastmod>/g)).toHaveLength(3);
    expect(content).not.toContain('<FC>');expect(content).not.toContain('A & B');
    const full=sitemapEntriesXml(kind,Array.from({length:sitemapBatchSize},()=>entries[0]));
    expect(full.match(/<url>/g)).toHaveLength(1500);expect(Buffer.byteLength(full)).toBeLessThan(2*1024*1024);
  });
  it('publishes both discovery points only in production',()=>{
    vi.stubEnv('VERCEL_ENV','production');expect(robots().sitemap).toEqual(['https://livasports.com/sitemap.xml','https://livasports.com/sports-sitemaps.xml']);
    vi.stubEnv('VERCEL_ENV','preview');expect(robots().sitemap).toBeUndefined();expect(robots().rules).toEqual({userAgent:'*',disallow:'/'});
  });
  it('serves valid XML batches, rejects out-of-range pages before loading entries',async()=>{
    vi.mocked(loadSitemapCounts).mockResolvedValue({matches:501,teams:0,players:0});vi.mocked(loadSitemapBatch).mockResolvedValue(entries);
    const response=await batch(new Request('https://livasports.com'),{params:Promise.resolve({batch:'matches-1.xml'})});
    expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('application/xml');
    expect(loadSitemapBatch).toHaveBeenCalledWith('matches',1);expect(await response.text()).toContain('<urlset');
    vi.mocked(loadSitemapBatch).mockClear();
    for(const value of ['matches-2.xml','teams-0.xml','matches-99999999999999.xml','invalid'])expect((await batch(new Request('https://livasports.com'),{params:Promise.resolve({batch:value})})).status).toBe(404);
    expect(loadSitemapBatch).not.toHaveBeenCalled();
  });
  it('does not present database failure as an empty successful sitemap or leak error details',async()=>{
    vi.mocked(loadSitemapCounts).mockRejectedValue(Error('private database value'));
    for(const response of [await index(),await batch(new Request('https://livasports.com'),{params:Promise.resolve({batch:'teams-0.xml'})})]){
      expect(response.status).toBe(503);expect(response.headers.get('retry-after')).toBe('300');expect(await response.text()).not.toContain('private');
    }
  });
});
