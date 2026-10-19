import {editorialSitemapXml} from '@/v2/seo';
import {publishedSitemap} from '@/editorial/server';
export const dynamic='force-static';
export const revalidate=3600;
export async function GET(){return new Response(editorialSitemapXml(await publishedSitemap()),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=0, s-maxage=3600'}});}
