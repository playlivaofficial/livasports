import {languageAlternates,matchPath,teamPath} from '@/localization/interface';
import {isNonSemanticParam,isPrivatePath,siteOrigin} from '@/seo/policy';

export const sitemapBatchSize=500;
/** Entity sets the repository can materialise; players stay queryable for the launch/audit scripts. */
export const sitemapKinds=['matches','teams','players'] as const;
export type SitemapKind=typeof sitemapKinds[number];
export type SitemapCounts=Record<SitemapKind,number>;
/**
 * M1: what is actually submitted. Player profiles were the largest and least commercial slice of the
 * ~263k submitted URLs, so they leave submission (routePolicies.player.sitemap === false) while keeping
 * their routes, internal links and their own indexability.
 */
export const submittedSitemapKinds=['matches','teams'] as const satisfies readonly SitemapKind[];
export type SubmittedSitemapKind=typeof submittedSitemapKinds[number];
export interface SportsSitemapEntry {publicId:string;name:string;away?:string;updatedAt:Date|string;}
/** Per-competition tab availability for the default season (P2 sitemap tab policy). */
export interface CompetitionSitemapSummary {slug:string;seasonId:string;upcoming:number;results:number;standings:boolean;scorers:boolean;teams:boolean;updatedAt:Date|null;}
const origin=siteOrigin;
export const xml=(value:string)=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));

export function sitemapBatches(counts:SitemapCounts){
  return submittedSitemapKinds.flatMap(kind=>Array.from({length:Math.ceil(counts[kind]/sitemapBatchSize)},(_,page)=>`${kind}-${page}.xml`));
}
export function parseSitemapBatch(batch:string):{kind:SubmittedSitemapKind;page:number}|null{
  const match=/^(matches|teams)-(0|[1-9]\d*)\.xml$/.exec(batch);
  if(!match||!Number.isSafeInteger(Number(match[2])))return null;
  return {kind:match[1] as SubmittedSitemapKind,page:Number(match[2])};
}
export function sitemapIndexXml(counts:SitemapCounts){
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapBatches(counts).map(batch=>`<sitemap><loc>${origin}/sports-sitemaps/${batch}</loc></sitemap>`).join('')}</sitemapindex>`;
}
export function sitemapEntriesXml(kind:SubmittedSitemapKind,entries:SportsSitemapEntry[]){
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.map(entry=>{
    const paths=(['br','mx','en'] as const).map(locale=>origin+(kind==='matches'?matchPath(locale,entry.publicId,entry.name,entry.away!):teamPath(locale,entry.publicId,entry.name)));
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

/** Minimal well-formedness check for our own sitemap output (tests + QA): balanced elements, escaped text/attributes, declared namespaces. */
export function sitemapXmlProblems(document:string):string[]{
  const problems:string[]=[];
  if(!document.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))problems.push('missing-xml-declaration');
  if(!/xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(document))problems.push('missing-sitemap-namespace');
  if(/<xhtml:link/.test(document)&&!/xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(document))problems.push('missing-xhtml-namespace');
  const body=document.replace(/^<\?xml[^>]*\?>/,'');
  const stack:string[]=[];let index=0;
  const tag=/<(\/)?([A-Za-z:][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/)?>/y;
  while(index<body.length){
    const lt=body.indexOf('<',index);
    const text=body.slice(index,lt<0?body.length:lt);
    if(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text))problems.push(`unescaped-ampersand:${text.slice(0,60)}`);
    if(text.includes('>'))problems.push(`raw-gt:${text.slice(0,60)}`);
    if(lt<0)break;
    tag.lastIndex=lt;const match=tag.exec(body);
    if(!match){problems.push(`malformed-tag:${body.slice(lt,lt+60)}`);break;}
    const [,closing,name,attributes,selfClosing]=match;
    if(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(attributes))problems.push(`unescaped-ampersand-attribute:${name}`);
    if(closing){if(stack.pop()!==name)problems.push(`unbalanced:${name}`);}
    else if(!selfClosing)stack.push(name);
    index=tag.lastIndex;
  }
  if(stack.length)problems.push(`unclosed:${stack.join(',')}`);
  const allowed=new Set(['urlset','url','loc','lastmod','changefreq','priority','xhtml:link','sitemapindex','sitemap']);
  for(const name of new Set([...body.matchAll(/<([A-Za-z:][\w:.-]*)/g)].map(m=>m[1])))if(!allowed.has(name))problems.push(`unsupported-element:${name}`);
  for(const [,value] of body.matchAll(/<lastmod>([^<]*)<\/lastmod>/g))if(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(value))problems.push(`lastmod-format:${value}`);
  return problems;
}
