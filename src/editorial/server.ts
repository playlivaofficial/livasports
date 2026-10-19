import 'server-only';
import {unstable_cache} from 'next/cache';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {localDataPreviewEnabled} from '@/multisport/local-preview';
import {NewsRepository} from './repository';
import {previewNews} from './seed';

export const newsCacheTag='v2-editorial-news';
export async function withNewsRepository<T>(work:(repo:NewsRepository)=>Promise<T>):Promise<T>{
  const url=databaseUrl();if(!url)throw new Error('NEWSROOM_UNAVAILABLE');
  const db=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:5000});
  try{return await work(new NewsRepository(db));}finally{await db.close();}
}
// Only explicitly opted-in, unhosted development may show the existing preview collection.
// Missing storage is honestly empty elsewhere; configured storage failures never fall back.
const cachedNews=unstable_cache(()=>withNewsRepository(repo=>repo.listPublished()),['editorial-published-v1'],{tags:[newsCacheTag],revalidate:3600});
const cachedStory=unstable_cache((slug:string)=>withNewsRepository(repo=>repo.findPublished(slug)),['editorial-story-v1'],{tags:[newsCacheTag],revalidate:3600});
const cachedSitemap=unstable_cache(()=>withNewsRepository(repo=>repo.sitemap()),['editorial-sitemap-v1'],{tags:[newsCacheTag],revalidate:3600});
export async function publishedNews(){return databaseUrl()?cachedNews():localDataPreviewEnabled()?previewNews:[];}
export async function publishedStory(slug:string){return databaseUrl()?cachedStory(slug):localDataPreviewEnabled()?previewNews.find(item=>item.slug===slug)??null:null;}
export async function publishedSitemap(){return databaseUrl()?cachedSitemap():localDataPreviewEnabled()?previewNews:[];}
