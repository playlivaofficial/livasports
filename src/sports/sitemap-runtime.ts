import 'server-only';
import {NextServerCache} from '@/cache/next-server-cache';
import {PostgresDatabaseClient,databaseUrl} from '@/database/client';
import {SportsSitemapRepository} from './sitemap-repository';
import {sitemapBatchSize,type SitemapKind} from './sitemap';
let repository:SportsSitemapRepository|undefined;
const cache=new NextServerCache();
function repo(){const url=databaseUrl();if(!url)throw Error('Sports database is not configured');return repository??=new SportsSitemapRepository(new PostgresDatabaseClient(url));}
// P2: sitemap freshness comes from <lastmod>, not from re-running the eligibility scans on every crawl.
// Entity batches are served from the shared data cache for six hours and survive a database outage for a day.
const entityCache={ttlSeconds:6*3600,staleIfErrorSeconds:24*3600};
export async function loadSitemapCounts(){return (await cache.getOrSet('sports:sitemap:v2:counts',entityCache,()=>repo().counts())).value;}
export async function loadSitemapBatch(kind:SitemapKind,page:number){return (await cache.getOrSet(`sports:sitemap:v2:${kind}:${page}`,entityCache,()=>repo().entries(kind,sitemapBatchSize,page*sitemapBatchSize))).value;}
export async function loadCompetitionSitemapSummaries(){return (await cache.getOrSet('sports:sitemap:v2:competitions',{ttlSeconds:3600,staleIfErrorSeconds:24*3600},()=>repo().competitionSummaries())).value;}
