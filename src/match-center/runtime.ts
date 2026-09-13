import 'server-only';
import { NextServerCache } from '@/cache/next-server-cache';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import type { SiteLocale } from '@/config/i18n';
import { headers } from 'next/headers';
import { MatchCenterLoader } from './loader';
import { PostgresMatchCenterRepository } from './repository';
import { requestCommercialGeo } from '@/odds/commercial-geo';

let loader: MatchCenterLoader | null = null;
let repository: PostgresMatchCenterRepository | null = null;

function getRepository(): PostgresMatchCenterRepository {
  if (repository) return repository;
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error('Match Center database is not configured');
  repository = new PostgresMatchCenterRepository(new PostgresDatabaseClient(connectionString));
  return repository;
}

function getLoader(): MatchCenterLoader {
  loader ??= new MatchCenterLoader(getRepository(), new NextServerCache(event => {
    console.info(`[LivaSports M4] ${JSON.stringify({ event:`cache-${event.event}`,key:event.key })}`);
  }));
  return loader;
}

export async function loadMatchCenter(publicId: string, locale: SiteLocale) {
  const started=performance.now();
  try { return await getLoader().load(publicId, locale, requestCommercialGeo(await headers())); }
  finally { console.info(`[LivaSports M4] ${JSON.stringify({event:'match-data-load',locale,publicId,durationMs:Math.round((performance.now()-started)*10)/10,providerRequests:0})}`); }
}
export function loadSitemapMatches() { return getRepository().sitemapFixtures(); }
