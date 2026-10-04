import type {InterfaceLocale} from '@/localization/interface';
import type {MetadataRoute} from 'next';
import {legalKinds} from '@/localization/legal-routes';
import {legalReviewedAt} from '@/localization/legal-content';
import {helpKinds} from '@/localization/help-routes';
import {helpReviewDate} from '@/localization/help-content';
import {xml,type CompetitionSitemapSummary} from '@/sports/sitemap';
import {competitionCanonical} from './policy';
import {absoluteUrl,alternateCluster,competitionPaths,enabledCompetitionSlugs,helpPaths,legalPaths,locales,staticPages,staticPaths} from './policy';
import type {CompetitionTab} from '@/sports/policy';

/**
 * P2 primary sitemap (/sitemap.xml): static hubs, legal/help documents and competition hubs
 * with the tabs the metadata policy marks indexable. Entities (matches, teams, players) live
 * only in /sports-sitemaps.xml so no URL is listed twice. lastModified is set only where a
 * source-backed date exists.
 */
type Cluster={paths:Record<InterfaceLocale,string>;lastModified?:Date};
function localized({paths,lastModified}:Cluster):MetadataRoute.Sitemap{
  const alternates={languages:alternateCluster(Object.fromEntries(locales.map(locale=>[locale,absoluteUrl(paths[locale])])) as Record<InterfaceLocale,string>)};
  return locales.map(locale=>({url:absoluteUrl(paths[locale]),...(lastModified?{lastModified}:{}),alternates}));
}
const tabOrder:readonly CompetitionTab[]=['fixtures','results','standings','scorers','teams'];
export function competitionClusters(summaries:readonly CompetitionSitemapSummary[]|null):Cluster[]{
  const bySlug=new Map((summaries??[]).map(summary=>[summary.slug,summary]));
  return enabledCompetitionSlugs().flatMap(slug=>{
    const summary=bySlug.get(slug);
    // `null` means the database was unavailable: keep every registry hub listed rather than dropping the section.
    // Loaded but absent means M1's coverage filter rejected it — routed, but not actually covered, so not submitted.
    if(!summary)return summaries===null?[{paths:competitionPaths(slug)}]:[];
    const rows:Record<CompetitionTab,number>={fixtures:summary.upcoming+Math.min(summary.results,5),results:summary.results,standings:summary.standings?1:0,scorers:summary.scorers?1:0,teams:summary.teams?1:0};
    // An ingestion observation is not evidence of a significant rendered-page change.
    const lastModified=undefined;
    return tabOrder.flatMap(tab=>{
      const canonical=competitionCanonical({slug,tab,seasonId:summary.seasonId,defaultSeasonId:summary.seasonId,page:1,pages:1,rows:rows[tab]});
      return canonical.indexable?[{paths:canonical.paths,lastModified}]:[];
    });
  });
}
export function primarySitemap(summaries:readonly CompetitionSitemapSummary[]|null):MetadataRoute.Sitemap{
  return [
    ...staticPages.flatMap(page=>localized({paths:staticPaths(page)})),
    ...legalKinds.flatMap(kind=>localized({paths:legalPaths(kind),lastModified:new Date(legalReviewedAt)})),
    ...helpKinds.flatMap(kind=>localized({paths:helpPaths(kind)}).map((row,i)=>({...row,lastModified:new Date(helpReviewDate(locales[i],kind))}))),
    ...competitionClusters(summaries).flatMap(localized),
  ];
}

/**
 * Serialise the primary sitemap ourselves. Next's MetadataRoute.Sitemap writer does not XML-escape
 * `<loc>`/`href` values, so the first two-parameter URL (`?competition=…&tab=…`) produced a raw `&`
 * and Google reported "Parsing error". Every text/attribute value goes through `xml()`.
 */
export function primarySitemapXml(rows:MetadataRoute.Sitemap){
  const entries=rows.map(row=>{
    const languages=(row.alternates?.languages??{}) as Record<string,string>;
    const links=Object.entries(languages).map(([lang,href])=>`<xhtml:link rel="alternate" hreflang="${xml(lang)}" href="${xml(href)}"/>`).join('');
    const lastmod=row.lastModified?`<lastmod>${new Date(row.lastModified).toISOString()}</lastmod>`:'';
    return `<url><loc>${xml(row.url)}</loc>${lastmod}${links}</url>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>`;
}

/** /sitemap.xml headers: correct XML type; edge caching with stale-while-revalidate so a cold competition summary never delays a crawler fetch. */
export const primarySitemapHeaders={'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'} as const;
