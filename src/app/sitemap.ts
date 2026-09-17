import type {MetadataRoute} from 'next';
import {primarySitemap} from '@/seo/sitemap';
import {loadCompetitionSitemapSummaries} from '@/sports/sitemap-runtime';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  // Entity history is paginated in /sports-sitemaps.xml. A database failure withholds tab detail only;
  // competition entries, hubs and documents are always listed.
  const summaries=await loadCompetitionSitemapSummaries().catch(()=>null);
  return primarySitemap(summaries);
}
