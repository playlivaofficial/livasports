import 'server-only';
import {unstable_cache} from 'next/cache';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {NewsRepository} from './repository';
import {previewNews} from './seed';

export const newsCacheTag='v2-editorial-news';
export async function withNewsRepository<T>(work:(repo:NewsRepository)=>Promise<T>):Promise<T>{
  const url=databaseUrl();if(!url)throw new Error('NEWSROOM_UNAVAILABLE');
  const db=new PostgresDatabaseClient(url,undefined,{statementTimeoutMs:5000});
  try{return await work(new NewsRepository(db));}finally{await db.close();}
}
function localPreview(){return !databaseUrl()&&process.env.VERCEL_ENV!=='production';}
// Local/CI fixtures are the same source-reviewed release collection. Production never
// substitutes seed content for the database or resurrects an archived publication.
const cachedNews=unstable_cache(()=>withNewsRepository(repo=>repo.listPublished()),['editorial-published-v1'],{tags:[newsCacheTag],revalidate:3600});
const cachedStory=unstable_cache((slug:string)=>withNewsRepository(repo=>repo.findPublished(slug)),['editorial-story-v1'],{tags:[newsCacheTag],revalidate:3600});
const cachedSitemap=unstable_cache(()=>withNewsRepository(repo=>repo.sitemap()),['editorial-sitemap-v1'],{tags:[newsCacheTag],revalidate:3600});
export async function publishedNews(){return localPreview()?previewNews:cachedNews();}
export async function publishedStory(slug:string){return localPreview()?previewNews.find(item=>item.slug===slug)??null:cachedStory(slug);}
export async function publishedSitemap(){return localPreview()?previewNews:cachedSitemap();}
