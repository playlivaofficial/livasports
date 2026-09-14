import {languageAlternates,matchPath,playerPath,teamPath} from '@/localization/interface';

export const sitemapBatchSize=500;
export const sitemapKinds=['matches','teams','players'] as const;
export type SitemapKind=typeof sitemapKinds[number];
export type SitemapCounts=Record<SitemapKind,number>;
export interface SportsSitemapEntry {publicId:string;name:string;away?:string;updatedAt:Date|string;}
const origin='https://livasports.com';
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
