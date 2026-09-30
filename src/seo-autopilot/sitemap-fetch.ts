import {SaxesParser} from 'saxes';
import {siteOrigin} from '@/seo/policy';
import {SitemapError,sitemapError,networkDiagnostic,retryAfter} from '@/seo/sitemap-errors';

export const SITEMAP_READ_TIMEOUT_MS=20_000;
const namespace='http://www.sitemaps.org/schemas/sitemap/0.9';
export function sitemapUrl(value:string){
  let url:URL;try{url=new URL(value);}catch{throw sitemapError('INVALID_SITEMAP','VALIDATE','INVALID_URL');}
  // Competition hubs intentionally use canonical query parameters. Never rewrite/exclude them here.
  if(url.origin!==siteOrigin||url.username||url.password||url.hash)throw sitemapError('INVALID_SITEMAP','VALIDATE','NON_CANONICAL_URL');
  return url.href;
}
/** Strict XML parsing, not HTML recovery: malformed/HTML/error pages can never become a success hash. */
export function parseSitemap(xml:string){
  if(Buffer.byteLength(xml)>25_000_000)throw sitemapError('INVALID_SITEMAP','VALIDATE','DOCUMENT_TOO_LARGE');
  const parser=new SaxesParser({xmlns:true});let root='',text='',inLoc=false,entries=0;const urls:string[]=[];let depth=0;
  parser.on('doctype',()=>{throw sitemapError('INVALID_SITEMAP','VALIDATE','DOCTYPE_FORBIDDEN');});
  parser.on('error',()=>{throw sitemapError('INVALID_SITEMAP','VALIDATE','MALFORMED_XML');});
  parser.on('opentag',tag=>{
    if(depth++===0){root=tag.local;if(!['urlset','sitemapindex'].includes(root)||tag.uri!==namespace)throw sitemapError('INVALID_SITEMAP','VALIDATE','INVALID_ROOT');}
    if(depth===2){if(tag.local!==(root==='urlset'?'url':'sitemap')||tag.uri!==namespace)throw sitemapError('INVALID_SITEMAP','VALIDATE','INVALID_ENTRY');entries++;}
    if(tag.local==='loc'){if(tag.uri!==namespace||depth!==3)throw sitemapError('INVALID_SITEMAP','VALIDATE','INVALID_LOCATION');inLoc=true;text='';}
  });
  parser.on('text',v=>{if(inLoc)text+=v;});parser.on('cdata',v=>{if(inLoc)text+=v;});
  parser.on('closetag',tag=>{if(tag.local==='loc'){urls.push(sitemapUrl(text.trim()));inLoc=false;}depth--;});
  try{parser.write(xml).close();}catch(e){if(e instanceof SitemapError)throw e;throw sitemapError('INVALID_SITEMAP','VALIDATE','MALFORMED_XML');}
  if(!root||!urls.length||urls.length!==entries||urls.length>50_000)throw sitemapError('INVALID_SITEMAP','VALIDATE','INVALID_DOCUMENT');
  return {root,urls};
}
export interface SitemapReadBudget {retries:number;deadline:number;sleep?:(ms:number)=>Promise<void>}
/** One retry for transient public GET failures, at most two retries across the whole cycle. */
export async function readSitemap(url:string,fetcher:typeof fetch,budget:SitemapReadBudget){
  sitemapUrl(url);
  if(new URL(url).search)throw sitemapError('INVALID_SITEMAP','FETCH','SITEMAP_DOCUMENT_QUERY_FORBIDDEN');
  for(let attempt=0;attempt<2;attempt++){
    try{
      const remaining=budget.deadline-Date.now();if(remaining<=0)throw sitemapError('NETWORK_ERROR','FETCH','CYCLE_DEADLINE');
      const r=await fetcher(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(SITEMAP_READ_TIMEOUT_MS,remaining))),redirect:'error'});
      if(!r.ok)throw sitemapError(r.status===429?'RATE_LIMIT':r.status>=500?'NETWORK_ERROR':'INVALID_SITEMAP','FETCH',r.status>=500?'SITEMAP_UNAVAILABLE':'SITEMAP_HTTP_ERROR',r.status,retryAfter(r));
      if(!/^(application|text)\/(?:[\w.+-]*\+)?xml(?:;|$)/i.test(r.headers.get('content-type')??''))throw sitemapError('INVALID_SITEMAP','VALIDATE','CONTENT_TYPE_NOT_XML',r.status);
      const xml=await r.text();const parsed=parseSitemap(xml);return {xml,...parsed};
    }catch(e){
      const d=networkDiagnostic(e,'FETCH');
      if(attempt||budget.retries>=2||d.category!=='NETWORK_ERROR'||(d.retryAfterSeconds??0)>0||budget.deadline-Date.now()<2000)throw new SitemapError(d);
      budget.retries++;
      await (budget.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(1000);
    }
  }
  throw sitemapError('UNKNOWN_ERROR','FETCH','READ_ATTEMPTS_EXHAUSTED');
}
export async function readSitemapTree(url:string,fetcher:typeof fetch,budget:SitemapReadBudget){
  const first=await readSitemap(url,fetcher,budget),documents=[first.xml];
  if(first.root==='urlset')return documents;
  const children=[...new Set(first.urls)];if(children.length>100)throw sitemapError('INVALID_SITEMAP','VALIDATE','CHILD_BUDGET_EXCEEDED');
  // Keep modest concurrency; settle the active pair before any failure releases the durable lease.
  for(let i=0;i<children.length;i+=2){
    const pair=await Promise.allSettled(children.slice(i,i+2).map(child=>readSitemap(child,fetcher,budget)));
    for(const result of pair){if(result.status==='rejected')throw result.reason;if(result.value.root!=='urlset')throw sitemapError('INVALID_SITEMAP','VALIDATE','NESTED_INDEX_UNSUPPORTED');documents.push(result.value.xml);}
  }
  return documents;
}
