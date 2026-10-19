import {interfaceLocales,languageTags,type InterfaceLocale} from '@/localization/interface';
import {legalKinds,legalPath} from '@/localization/legal-routes';
import {helpKinds,helpPath} from '@/localization/help-routes';
import {articles} from './content';
import {leagues} from './leagues';
import {namespaces,toolIds,v2Path,type Section} from './routes';
import type {PublishedNews} from '@/editorial/model';
import {newsPath} from '@/editorial/copy';
const origin='https://livasports.com';
const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
/** Finite, deployment-generated inventory. No DB, provider, artificial date or daily rebuild. */
export function editorialSitemapClusters():Record<InterfaceLocale,string>[] {
 const paths:((locale:InterfaceLocale)=>string)[]=[locale=>v2Path(locale),
  locale=>newsPath(locale),
  ...(Object.keys(namespaces.en) as Section[]).filter(section=>section!=='search').map(section=>(locale:InterfaceLocale)=>v2Path(locale,section)),
  ...articles.map(article=>(locale:InterfaceLocale)=>v2Path(locale,article.category,article.id)),
  ...leagues.map(league=>(locale:InterfaceLocale)=>v2Path(locale,'leagues',league.id)),
  ...toolIds.map(id=>(locale:InterfaceLocale)=>v2Path(locale,'tools',id)),
  ...legalKinds.map(kind=>(locale:InterfaceLocale)=>legalPath(locale,kind)),
  ...helpKinds.map(kind=>(locale:InterfaceLocale)=>helpPath(locale,kind))];
 // Unverified operator review frameworks are deliberately noindex and excluded.
 return paths.map(path=>Object.fromEntries(interfaceLocales.map(locale=>[locale,origin+path(locale)])) as Record<InterfaceLocale,string>);
}
export function editorialSitemapXml(news:PublishedNews[]=[]){const clusters=[...editorialSitemapClusters().map(paths=>({paths,lastmod:null as string|null})),...news.map(item=>({paths:Object.fromEntries(interfaceLocales.map(locale=>[locale,origin+newsPath(locale,item.slug)])) as Record<InterfaceLocale,string>,lastmod:item.updatedAt}))];return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'+clusters.flatMap(({paths:cluster,lastmod})=>interfaceLocales.map(locale=>'<url><loc>'+xml(cluster[locale])+'</loc>'+(lastmod?`<lastmod>${xml(lastmod)}</lastmod>`:'')+interfaceLocales.map(language=>`<xhtml:link rel="alternate" hreflang="${languageTags[language]}" href="${xml(cluster[language])}"/>`).join('')+`<xhtml:link rel="alternate" hreflang="x-default" href="${xml(cluster.en)}"/></url>`)).join('')+'</urlset>';}
