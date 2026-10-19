import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({news:vi.fn(),sports:vi.fn(),xml:vi.fn()}));
vi.mock('@/editorial/server',()=>({publishedSitemap:mocks.news}));
vi.mock('@/multisport/server',()=>({publishedSnapshots:mocks.sports}));
vi.mock('@/v2/seo',()=>({editorialSitemapXml:mocks.xml}));
import {GET,dynamic,revalidate} from './route';

describe('published-only sitemap route',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.news.mockResolvedValue([]);mocks.sports.mockResolvedValue([]);mocks.xml.mockReturnValue('<?xml version="1.0"?><urlset/>');});
 it('uses both read-only published lists and retains the existing cache and XML contract',async()=>{
  const news=[{slug:'synthetic-published-story'}],snapshots=[{competitionId:'synthetic-published-competition'}];
  mocks.news.mockResolvedValue(news);mocks.sports.mockResolvedValue(snapshots);
  const response=await GET();expect(mocks.news).toHaveBeenCalledOnce();expect(mocks.sports).toHaveBeenCalledOnce();expect(mocks.xml).toHaveBeenCalledWith(news,snapshots);
  expect(await response.text()).toBe('<?xml version="1.0"?><urlset/>');expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=3600');expect(dynamic).toBe('force-static');expect(revalidate).toBe(3600);
 });
 it.each(['news','sports'] as const)('does not turn a configured %s storage failure into a cacheable empty sitemap',async key=>{
  mocks[key].mockRejectedValue(new Error('SYNTHETIC_STORAGE_FAILURE'));
  await expect(GET()).rejects.toThrow('SYNTHETIC_STORAGE_FAILURE');expect(mocks.xml).not.toHaveBeenCalled();
 });
});
