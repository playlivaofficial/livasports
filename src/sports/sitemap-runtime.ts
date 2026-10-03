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
// Data Cache survives deployments: V2 changes eligibility and adds locale-scoped lastmod.
// Never reuse pre-V2 entry objects that lack lastmodLocales under the new renderer.
const entityCacheVersion='sports:sitemap:v5-geo';
// Counts materialise all three eligibility sets (the slowest query); once a day is enough for batch numbering.
export async function loadSitemapCounts(){return (await cache.getOrSet(`${entityCacheVersion}:counts`,{ttlSeconds:24*3600,staleIfErrorSeconds:48*3600},()=>repo().counts())).value;}
export async function loadSitemapBatch(kind:SitemapKind,page:number){return (await cache.getOrSet(`${entityCacheVersion}:${kind}:${page}`,entityCache,()=>repo().entries(kind,sitemapBatchSize,page*sitemapBatchSize))).value;}
export async function loadCompetitionSitemapSummaries(){return (await cache.getOrSet('sports:sitemap:v3:competitions',{ttlSeconds:3600,staleIfErrorSeconds:24*3600},()=>repo().competitionSummaries())).value;}
