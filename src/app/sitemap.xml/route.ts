import {editorialSitemapXml} from '@/v2/seo';
import {publishedSitemap} from '@/editorial/server';
import {publishedSnapshots} from '@/multisport/server';
// Publication lists retain their tagged five-minute data cache. Do not freeze
// the XML in a build artifact: Owner publication/withdrawal must reach crawlers.
export const dynamic='force-dynamic';
export async function GET(){
 const [news,snapshots]=await Promise.all([publishedSitemap(),publishedSnapshots()]);
 return new Response(editorialSitemapXml(news,snapshots),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
}
