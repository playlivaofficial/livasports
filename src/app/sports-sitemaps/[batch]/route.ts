import {loadSitemapBatch,loadSitemapCounts} from '@/sports/sitemap-runtime';
import {parseSitemapBatch,sitemapBatchSize,sitemapEntriesXml} from '@/sports/sitemap';
export async function GET(_request:Request,{params}:{params:Promise<{batch:string}>}){
  const batch=parseSitemapBatch((await params).batch);
  if(!batch)return new Response('Not found',{status:404});
  try{
    const counts=await loadSitemapCounts();
    if(batch.page>=Math.ceil(counts[batch.kind]/sitemapBatchSize))return new Response('Not found',{status:404});
    return new Response(sitemapEntriesXml(batch.kind,await loadSitemapBatch(batch.kind,batch.page)),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
  }catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Retry-After':'300'}});}
}
