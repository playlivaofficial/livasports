import {editorialSitemapXml} from '@/v2/seo';
import {publishedSitemap} from '@/editorial/server';
import {publishedSnapshots} from '@/multisport/server';
export const dynamic='force-static';
export const revalidate=3600;
export async function GET(){
 const [news,snapshots]=await Promise.all([publishedSitemap(),publishedSnapshots()]);
 return new Response(editorialSitemapXml(news,snapshots),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=0, s-maxage=3600'}});
}
