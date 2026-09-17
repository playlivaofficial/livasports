import {primarySitemap,primarySitemapHeaders,primarySitemapXml} from '@/seo/sitemap';
import {loadCompetitionSitemapSummaries} from '@/sports/sitemap-runtime';
export const dynamic='force-dynamic';
export async function GET(){
  // Entity history is paginated in /sports-sitemaps.xml. A database failure withholds tab detail only;
  // competition entries, hubs and documents are always listed.
  const summaries=await loadCompetitionSitemapSummaries().catch(()=>null);
  return new Response(primarySitemapXml(primarySitemap(summaries)),{headers:primarySitemapHeaders});
}
