import type { MetadataRoute } from 'next';
import {loadSitemapMatches} from '@/match-center/runtime';
import {loadSitemapPlayers,loadSitemapTeams} from '@/profiles/runtime';
import {interfaceRoutes,matchPath,playerPath,teamPath,languageAlternates} from '@/localization/interface';
import type {PageKey} from '@/config/i18n';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {competitionPath} from '@/sports/policy';
import {legalKinds,legalPath} from '@/localization/legal-routes';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  // Full entity history is paginated in /sports-sitemaps.xml; keep the original entry point small.
  const [matches,teams,players]=await Promise.all([loadSitemapMatches(100),loadSitemapTeams(50),loadSitemapPlayers(50)]);
  const localized=(paths:string[],lastModified:Date|undefined,priority:number)=>{
    const [br,mx,en]=paths.map(path=>`https://livasports.com${path}`);
    const alternates={languages:languageAlternates(br,mx,en)};
    return [br,mx,en].map(url=>({url,lastModified,changeFrequency:'daily' as const,priority,alternates}));
  };
  const locales=['br','mx','en'] as const;
  return [
    ...(Object.keys(interfaceRoutes.en) as PageKey[]).flatMap(page=>localized(locales.map(locale=>interfaceRoutes[locale][page]),undefined,page==='home'?1:0.9)),
    ...legalKinds.flatMap(kind=>localized(locales.map(locale=>legalPath(locale,kind)),undefined,0.3)),
    ...FOOTBALL_COMPETITION_TARGETS.filter(c=>c.enabled).flatMap(c=>localized(locales.map(locale=>competitionPath(locale,c.slug)),undefined,0.85)),
    ...matches.flatMap(row=>localized(locales.map(locale=>matchPath(locale,row.publicId,row.home,row.away)),row.updatedAt,0.7)),
    ...teams.flatMap(row=>localized(locales.map(locale=>teamPath(locale,row.publicId,row.name)),row.updatedAt,0.8)),
    ...players.flatMap(row=>localized(locales.map(locale=>playerPath(locale,row.publicId,row.name)),row.updatedAt,0.65)),
  ];
}
