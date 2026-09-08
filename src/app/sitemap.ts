import type { MetadataRoute } from 'next';
import { loadSitemapMatches } from '@/match-center/runtime';
import { matchPath } from '@/match-center/routes';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows=await loadSitemapMatches();
  return rows.flatMap(row=>{const br=`https://livasports.com${matchPath('br',row.publicId,row.home,row.away)}`;const mx=`https://livasports.com${matchPath('mx',row.publicId,row.home,row.away)}`;const alternates={languages:{'pt-BR':br,'es-MX':mx}};return [{url:br,lastModified:row.updatedAt,changeFrequency:'daily' as const,priority:0.7,alternates},{url:mx,lastModified:row.updatedAt,changeFrequency:'daily' as const,priority:0.7,alternates}]});
}
