import type { MetadataRoute } from 'next';
import { loadSitemapMatches } from '@/match-center/runtime';
import { matchPath } from '@/match-center/routes';
import { loadSitemapPlayers, loadSitemapTeams } from '@/profiles/runtime';
import { playerPath, teamPath } from '@/profiles/routes';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [matches,teams,players]=await Promise.all([loadSitemapMatches(),loadSitemapTeams(),loadSitemapPlayers()]);
  const localized=(br:string,mx:string,lastModified:Date,priority:number)=>{const alternates={languages:{'pt-BR':br,'es-MX':mx}};return [
    {url:br,lastModified,changeFrequency:'daily' as const,priority,alternates},{url:mx,lastModified,changeFrequency:'daily' as const,priority,alternates}]};
  return [
    ...matches.flatMap(row=>localized(`https://livasports.com${matchPath('br',row.publicId,row.home,row.away)}`,
      `https://livasports.com${matchPath('mx',row.publicId,row.home,row.away)}`,row.updatedAt,0.7)),
    ...teams.flatMap(row=>localized(`https://livasports.com${teamPath('br',row.publicId,row.name)}`,
      `https://livasports.com${teamPath('mx',row.publicId,row.name)}`,row.updatedAt,0.8)),
    ...players.flatMap(row=>localized(`https://livasports.com${playerPath('br',row.publicId,row.name)}`,
      `https://livasports.com${playerPath('mx',row.publicId,row.name)}`,row.updatedAt,0.65)),
  ];
}
