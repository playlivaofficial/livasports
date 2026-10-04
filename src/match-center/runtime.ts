import 'server-only';
import { NextServerCache } from '@/cache/next-server-cache';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import type { SiteLocale } from '@/config/i18n';
import { headers } from 'next/headers';
import { MatchCenterLoader } from './loader';
import { PostgresMatchCenterRepository } from './repository';
import { requestCommercialGeo } from '@/odds/commercial-geo';
import {cache} from 'react';
import {unstable_cache} from 'next/cache';
import type {Cache} from '@/cache/cache';
import {cacheKeys} from '@/cache/keys';
import {publicMatchRevalidate} from './public-cache-policy';
import {FixtureStatus} from '@/domain/enums';

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

// The public SEO shell has one lifetime. Nesting the old 60-second module caches
// would silently reduce even historical pages to a 60-second ISR lifetime.
const directRead: Cache = {
  async get() { return null; },
  async set() {},
  async delete() {},
  async getOrSet<T>(_key: string, _options: unknown, read: () => Promise<T>) {
    return {value: await read(), status: 'MISS' as const};
  },
};

/** Public canonical sports facts only: no request GEO, cookies, odds or offers. */
export const loadPublicMatchCenter = cache(async (publicId: string, locale: SiteLocale) => {
  const repo = getRepository();
  const header = await repo.header(publicId, locale);
  const terminal = header && [FixtureStatus.FINISHED,FixtureStatus.CANCELLED,FixtureStatus.ABANDONED].includes(header.status);
  // Finished pages show the available table at shell regeneration, not a claimed
  // historical round reconstruction. A different match's table update must not
  // evict the entire archive; direct corrections to this fixture still do.
  const tags = [cacheKeys.fixture(publicId), ...(header ? [cacheKeys.fixture(header.id)] : []),
    ...(header && !terminal ? [`standings:${header.competitionId}`] : [])];
  return unstable_cache(
    () => new MatchCenterLoader(repo, directRead).load(publicId, locale, null, {header, includeOdds: false, strictPublicSnapshot: true}),
    ['public-match-shell-v1', publicId, locale, header?.status ?? 'missing'],
    {revalidate: publicMatchRevalidate(header), tags},
  )();
});

/** Existing live client reads remain independently fresh and never load odds. */
export async function loadMatchSnapshot(publicId: string, locale: SiteLocale) {
  return getLoader().load(publicId, locale, null, {includeOdds: false});
}
export function loadSitemapMatches(limit=100) { return getRepository().sitemapFixtures(limit); }
