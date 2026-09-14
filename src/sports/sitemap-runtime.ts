import 'server-only';
import {NextServerCache} from '@/cache/next-server-cache';
import {PostgresDatabaseClient,databaseUrl} from '@/database/client';
import {SportsSitemapRepository} from './sitemap-repository';
import {sitemapBatchSize,type SitemapKind} from './sitemap';
let repository:SportsSitemapRepository|undefined;
const cache=new NextServerCache();
function repo(){const url=databaseUrl();if(!url)throw Error('Sports database is not configured');return repository??=new SportsSitemapRepository(new PostgresDatabaseClient(url));}
export async function loadSitemapCounts(){return (await cache.getOrSet('sports:sitemap:v1:counts',{ttlSeconds:300,staleIfErrorSeconds:0},()=>repo().counts())).value;}
export async function loadSitemapBatch(kind:SitemapKind,page:number){return (await cache.getOrSet(`sports:sitemap:v1:${kind}:${page}`,{ttlSeconds:300,staleIfErrorSeconds:0},()=>repo().entries(kind,sitemapBatchSize,page*sitemapBatchSize))).value;}
