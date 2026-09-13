import type { MetadataRoute } from 'next';
import {loadSitemapMatches} from '@/match-center/runtime';
import {loadSitemapPlayers,loadSitemapTeams} from '@/profiles/runtime';
import {interfaceRoutes,matchPath,playerPath,teamPath,languageAlternates} from '@/localization/interface';
import type {PageKey} from '@/config/i18n';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const [matches,teams,players]=await Promise.all([loadSitemapMatches(),loadSitemapTeams(),loadSitemapPlayers()]);
  const localized=(paths:string[],lastModified:Date|undefined,priority:number)=>{
    const [br,mx,en]=paths.map(path=>`https://livasports.com${path}`);
    const alternates={languages:languageAlternates(br,mx,en)};
    return [br,mx,en].map(url=>({url,lastModified,changeFrequency:'daily' as const,priority,alternates}));
  };
  const locales=['br','mx','en'] as const;
  return [
    ...(Object.keys(interfaceRoutes.en) as PageKey[]).flatMap(page=>localized(locales.map(locale=>interfaceRoutes[locale][page]),undefined,page==='home'?1:0.9)),
    ...matches.flatMap(row=>localized(locales.map(locale=>matchPath(locale,row.publicId,row.home,row.away)),row.updatedAt,0.7)),
    ...teams.flatMap(row=>localized(locales.map(locale=>teamPath(locale,row.publicId,row.name)),row.updatedAt,0.8)),
    ...players.flatMap(row=>localized(locales.map(locale=>playerPath(locale,row.publicId,row.name)),row.updatedAt,0.65)),
  ];
}
