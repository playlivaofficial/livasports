import {load} from 'cheerio';
import {siteOrigin} from '@/seo/policy';
import {contentHash} from './policy';

/** Real server HTML, never a validator flag supplied by the publisher. */
export function inspectSeoHtml(url:string,status:number,html:string,robotsHeader=''){
  const $=load(html);$('script:not([type="application/ld+json"]),style').remove();
  const title=$('title').first().text().trim(),h1=$('h1').first().text().trim();
  const canonical=$('link[rel="canonical"]').attr('href')??'';
  const robots=[$('meta[name="robots"]').attr('content')??'',robotsHeader].join(',');
  const primary=$('main').map((_,el)=>$(el).text().replace(/\s+/g,' ').trim()).get().sort((a,b)=>b.length-a.length)[0]??'';
  const problems:string[]=[];
  if(status!==200)problems.push(status>=300&&status<400?'REDIRECT':'HTTP_ERROR');
  if(canonical!==url)problems.push('CANONICAL_MISMATCH');
  if(/noindex|nofollow/i.test(robots))problems.push('ROBOTS_MISMATCH');
  if(!title||title.length>180)problems.push('MALFORMED_TITLE');
  if(!h1)problems.push('EMPTY_H1');
  if(primary.length<150)problems.push('MISSING_PRIMARY_CONTENT');
  let structuredDataValid=true;
  const schemas:unknown[]=[];
  $('script[type="application/ld+json"]').each((_,el)=>{try{schemas.push(JSON.parse($(el).text()));}catch{structuredDataValid=false;}});
  if(!structuredDataValid)problems.push('JSON_LD_PARSE_ERROR');
  const alternates=$('link[hreflang]').map((_,el)=>({lang:$(el).attr('hreflang'),href:$(el).attr('href')})).get();
  if(!['pt-BR','es-MX','en'].every(lang=>alternates.some(a=>a.lang===lang)))problems.push('LOCALE_ALTERNATE_MISSING');
  // Suspense delivers real HTML anchors in sibling fragments before React attaches them to main.
  // Parse anchors in the entire document, never href strings embedded in scripts or JSON payloads.
  const links=[...new Set($('a[href]').map((_,el)=>{
    try{const u=new URL($(el).attr('href')!,siteOrigin);return u.origin===siteOrigin?u.href:'';}catch{return '';}
  }).get().filter(Boolean))];
  return {url,status,title,description:$('meta[name="description"]').attr('content')??'',h1,canonical,indexFollow:!(/noindex|nofollow/i.test(robots)),primaryLength:primary.length,
    structuredDataValid,alternates,links,problems,metadataHash:contentHash({title,h1,canonical,schemas})};
}
export type HtmlAudit=ReturnType<typeof inspectSeoHtml>;
export async function crawlSeoUrl(url:string,fetcher:typeof fetch=fetch):Promise<HtmlAudit>{
  const u=new URL(url);if(u.origin!==siteOrigin)throw Error('SEO_ORIGIN_NOT_ALLOWED');
  // Next.js blocks streaming for search crawlers. Inspect that complete server response,
  // not an unfinished Suspense shell. Content is identical; no SEO-only rendering branch.
  const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(15_000),headers:{'user-agent':'Googlebot'}});
  return inspectSeoHtml(url,r.status,await r.text(),r.headers.get('x-robots-tag')??'');
}
