import {languageAlternates,matchPath,playerPath,teamPath} from '@/localization/interface';
import {isNonSemanticParam,isPrivatePath,siteOrigin} from '@/seo/policy';

export const sitemapBatchSize=500;
export const sitemapKinds=['matches','teams','players'] as const;
export type SitemapKind=typeof sitemapKinds[number];
export type SitemapCounts=Record<SitemapKind,number>;
export interface SportsSitemapEntry {publicId:string;name:string;away?:string;updatedAt:Date|string;}
/** Per-competition tab availability for the default season (P2 sitemap tab policy). */
export interface CompetitionSitemapSummary {slug:string;seasonId:string;upcoming:number;results:number;standings:boolean;scorers:boolean;teams:boolean;updatedAt:Date|null;}
const origin=siteOrigin;
const xml=(value:string)=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));

export function sitemapBatches(counts:SitemapCounts){
  return sitemapKinds.flatMap(kind=>Array.from({length:Math.ceil(counts[kind]/sitemapBatchSize)},(_,page)=>`${kind}-${page}.xml`));
}
export function parseSitemapBatch(batch:string):{kind:SitemapKind;page:number}|null{
  const match=/^(matches|teams|players)-(0|[1-9]\d*)\.xml$/.exec(batch);
  if(!match||!Number.isSafeInteger(Number(match[2])))return null;
  return {kind:match[1] as SitemapKind,page:Number(match[2])};
}
export function sitemapIndexXml(counts:SitemapCounts){
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapBatches(counts).map(batch=>`<sitemap><loc>${origin}/sports-sitemaps/${batch}</loc></sitemap>`).join('')}</sitemapindex>`;
}
export function sitemapEntriesXml(kind:SitemapKind,entries:SportsSitemapEntry[]){
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.map(entry=>{
    const paths=(['br','mx','en'] as const).map(locale=>origin+(kind==='matches'?matchPath(locale,entry.publicId,entry.name,entry.away!):kind==='teams'?teamPath(locale,entry.publicId,entry.name):playerPath(locale,entry.publicId,entry.name)));
    const links=Object.entries(languageAlternates(paths[0],paths[1],paths[2])).map(([lang,href])=>`<xhtml:link rel="alternate" hreflang="${lang}" href="${xml(href)}"/>`).join('');
    return paths.map(path=>`<url><loc>${xml(path)}</loc><lastmod>${new Date(entry.updatedAt).toISOString()}</lastmod>${links}</url>`).join('');
  }).join('')}</urlset>`;
}

/** Structural + policy validation shared by unit tests and the built-app QA runner. */
export interface SitemapUrlProblem {url:string;reason:'not-absolute'|'wrong-origin'|'private-path'|'non-semantic-param'|'param-order'|'duplicate'|'fragment';}
const semanticOrder=['competition','tab','season','p'];
export function validateSitemapUrls(urls:readonly string[]):SitemapUrlProblem[]{
  const problems:SitemapUrlProblem[]=[],seen=new Set<string>();
  for(const url of urls){
    if(seen.has(url))problems.push({url,reason:'duplicate'});seen.add(url);
    let parsed:URL;try{parsed=new URL(url);}catch{problems.push({url,reason:'not-absolute'});continue;}
    if(parsed.origin!==origin||parsed.protocol!=='https:')problems.push({url,reason:'wrong-origin'});
    if(parsed.hash)problems.push({url,reason:'fragment'});
    if(isPrivatePath(parsed.pathname))problems.push({url,reason:'private-path'});
    const keys=[...parsed.searchParams.keys()];
    if(keys.some(isNonSemanticParam))problems.push({url,reason:'non-semantic-param'});
    const order=keys.filter(key=>!isNonSemanticParam(key)).map(key=>semanticOrder.indexOf(key));
    if(order.some((value,index)=>value<0||(index>0&&value<=order[index-1])))problems.push({url,reason:'param-order'});
  }
  return problems;
}
