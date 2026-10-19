import {interfaceLocales,languageTags,type InterfaceLocale} from '@/localization/interface';
import {legalKinds,legalPath} from '@/localization/legal-routes';
import {helpKinds,helpPath} from '@/localization/help-routes';
import {articles} from './content';
import {namespaces,toolIds,v2Path,type Section} from './routes';
import type {PublishedNews} from '@/editorial/model';
import {newsPath} from '@/editorial/copy';
import {newsTranslationRoutes,usablePublishedNews} from '@/editorial/presentation';
import {sportIds,sportsPath} from '@/multisport/catalog';
import {sportsSitemapClusters} from '@/multisport/seo';
import type {SportsSnapshot} from '@/multisport/model';
const origin='https://livasports.com';
const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
/** Finite, deployment-generated inventory. No DB, provider, artificial date or daily rebuild. */
export function editorialSitemapClusters():Record<InterfaceLocale,string>[] {
 const paths:((locale:InterfaceLocale)=>string)[]=[locale=>v2Path(locale),
  locale=>newsPath(locale),
  ...(Object.keys(namespaces.en) as Section[]).filter(section=>!['search','football','leagues'].includes(section)).map(section=>(locale:InterfaceLocale)=>v2Path(locale,section)),
  locale=>sportsPath(locale),
  ...sportIds.map(sport=>(locale:InterfaceLocale)=>sportsPath(locale,sport)),
  ...articles.map(article=>(locale:InterfaceLocale)=>v2Path(locale,article.category,article.id)),
  ...toolIds.map(id=>(locale:InterfaceLocale)=>v2Path(locale,'tools',id)),
  ...legalKinds.map(kind=>(locale:InterfaceLocale)=>legalPath(locale,kind)),
  ...helpKinds.map(kind=>(locale:InterfaceLocale)=>helpPath(locale,kind))];
 // Unverified operator review frameworks are deliberately noindex and excluded.
 return paths.map(path=>Object.fromEntries(interfaceLocales.map(locale=>[locale,origin+path(locale)])) as Record<InterfaceLocale,string>);
}
export function editorialSitemapXml(news:PublishedNews[]=[],snapshots:readonly SportsSnapshot[]=[],now:Date|number=Date.now()){
 const clusters:{paths:Partial<Record<InterfaceLocale,string>>;lastmod:string|null;fallback?:string}[]=[...editorialSitemapClusters().map(paths=>({paths,lastmod:null})),...news.flatMap(item=>{
  if(!usablePublishedNews(item,new Date(now)))return [];
  const presentation=interfaceLocales.map(locale=>newsTranslationRoutes(item,locale)).find(value=>value?.indexable);if(!presentation)return [];
  return [{paths:Object.fromEntries(presentation.locales.map(locale=>[locale,origin+newsPath(locale,item.slug)])),lastmod:item.updatedAt,fallback:origin+presentation.languages['x-default']}];
 })];
 // Keep reciprocal language clusters intact and existing news inventory ahead of data pages.
 // If the catalogue outgrows this single-file budget, use a sitemap index before expanding it.
 const remainingClusters=Math.max(0,Math.floor(50000/interfaceLocales.length)-clusters.length);
 clusters.push(...sportsSitemapClusters(snapshots,now).slice(0,remainingClusters));
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+clusters.flatMap(({paths:cluster,lastmod,fallback})=>{const locales=interfaceLocales.filter(locale=>cluster[locale]);return locales.map(locale=>'<url><loc>'+xml(cluster[locale]!)+'</loc>'+(lastmod?`<lastmod>${xml(lastmod)}</lastmod>`:'')+locales.map(language=>`<xhtml:link rel="alternate" hreflang="${languageTags[language]}" href="${xml(cluster[language]!) }"/>`).join('')+`<xhtml:link rel="alternate" hreflang="x-default" href="${xml(fallback??cluster.en!)}"/></url>`);}).join('')+'</urlset>';
}
