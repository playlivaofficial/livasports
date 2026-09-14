import {loadSitemapCounts} from '@/sports/sitemap-runtime';
import {sitemapIndexXml} from '@/sports/sitemap';
export async function GET(){
  try{return new Response(sitemapIndexXml(await loadSitemapCounts()),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});}
  catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Retry-After':'300'}});}
}
