import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const storage=vi.hoisted(()=>({
  url:vi.fn<()=>string|null>(()=>null),opened:vi.fn(),close:vi.fn(async()=>{}),
  list:vi.fn(async()=>[] as unknown[]),story:vi.fn(async()=>null as unknown),sitemap:vi.fn(async()=>[] as unknown[]),
}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({unstable_cache:(work:unknown)=>work}));
vi.mock('@/database/client',()=>({databaseUrl:storage.url,PostgresDatabaseClient:class{
  constructor(...args:unknown[]){storage.opened(...args);}
  close=storage.close;
}}));
vi.mock('./repository',()=>({NewsRepository:class{
  listPublished=storage.list;findPublished=storage.story;sitemap=storage.sitemap;
}}));
import {publishedNews,publishedSitemap,publishedStory,withNewsRepository} from './server';
import {previewNews} from './seed';

const markers=['VERCEL','VERCEL_ENV','VERCEL_URL','DATABASE_URL','DATABASE_POSTGRES_URL','POSTGRES_URL'];
beforeEach(()=>{
  vi.clearAllMocks();storage.url.mockReturnValue(null);storage.list.mockResolvedValue([]);storage.story.mockResolvedValue(null);storage.sitemap.mockResolvedValue([]);
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('V3_LOCAL_DATA_PREVIEW','true');
  for(const key of markers)vi.stubEnv(key,undefined);
});
afterEach(()=>vi.unstubAllEnvs());

async function expectNoNews(){
  expect(await publishedNews()).toEqual([]);expect(await publishedSitemap()).toEqual([]);
  expect(await publishedStory(previewNews[0].slug)).toBeNull();expect(storage.opened).not.toHaveBeenCalled();
}

describe('news storage and explicit local preview boundary',()=>{
  it.each(['production','test','','Development'])('never substitutes seed news without storage in NODE_ENV=%s',async environment=>{
    vi.stubEnv('NODE_ENV',environment);await expectNoNews();
  });
  it.each([undefined,'false','1','TRUE','true '])('requires exact development preview opt-in, not %s',async flag=>{
    vi.stubEnv('V3_LOCAL_DATA_PREVIEW',flag);await expectNoNews();
  });
  it.each(markers)('blocks preview when %s is present even with an empty or false-like value',async key=>{
    for(const value of ['','0','false','configured']){vi.stubEnv(key,value);await expectNoNews();}
  });
  it('shows only the existing seed collection in explicitly opted-in unhosted development',async()=>{
    expect(await publishedNews()).toBe(previewNews);expect(await publishedSitemap()).toBe(previewNews);
    expect(await publishedStory(previewNews[0].slug)).toBe(previewNews[0]);expect(await publishedStory('not-a-preview-story')).toBeNull();
    expect(storage.opened).not.toHaveBeenCalled();expect(storage.list).not.toHaveBeenCalled();
  });
  it('uses configured storage even when local preview was requested and never fills an empty database with seeds',async()=>{
    storage.url.mockReturnValue('postgresql://test.invalid/test-only');
    expect(await publishedNews()).toEqual([]);expect(await publishedStory(previewNews[0].slug)).toBeNull();expect(await publishedSitemap()).toEqual([]);
    expect(storage.list).toHaveBeenCalledOnce();expect(storage.story).toHaveBeenCalledWith(previewNews[0].slug);expect(storage.sitemap).toHaveBeenCalledOnce();
    expect(storage.opened).toHaveBeenCalledTimes(3);expect(storage.close).toHaveBeenCalledTimes(3);
  });
  it('returns only storage publications when configured',async()=>{
    storage.url.mockReturnValue('postgresql://test.invalid/test-only');
    const published={slug:'database-only-test'};storage.list.mockResolvedValue([published]);storage.story.mockResolvedValue(published);storage.sitemap.mockResolvedValue([published]);
    expect(await publishedNews()).toEqual([published]);expect(await publishedStory(published.slug)).toBe(published);expect(await publishedSitemap()).toEqual([published]);
    expect(storage.close).toHaveBeenCalledTimes(3);
  });
  it('propagates configured storage failures without substituting seed publications and always closes storage',async()=>{
    storage.url.mockReturnValue('postgresql://test.invalid/test-only');
    const failure=new Error('TEST_STORAGE_UNAVAILABLE');storage.list.mockRejectedValue(failure);storage.story.mockRejectedValue(failure);storage.sitemap.mockRejectedValue(failure);
    await expect(publishedNews()).rejects.toBe(failure);await expect(publishedStory(previewNews[0].slug)).rejects.toBe(failure);await expect(publishedSitemap()).rejects.toBe(failure);
    expect(storage.close).toHaveBeenCalledTimes(3);
  });
  it('keeps direct repository operations unavailable without storage',async()=>{
    await expect(withNewsRepository(async()=>null)).rejects.toThrow('NEWSROOM_UNAVAILABLE');expect(storage.opened).not.toHaveBeenCalled();
  });
});
