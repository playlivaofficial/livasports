import {parseSitemapBatch} from '@/sports/sitemap';
export async function GET(_request:Request,{params}:{params:Promise<{batch:string}>}){
  const batch=parseSitemapBatch((await params).batch);
  if(!batch)return new Response('Not found',{status:404});
  return new Response('This legacy live-data sitemap has been retired. Historical canonical pages remain available.',{status:410,headers:{'Cache-Control':'public, max-age=86400','X-Robots-Tag':'noindex'}});
}
