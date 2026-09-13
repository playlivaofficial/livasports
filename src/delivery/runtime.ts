import 'server-only';
import { NextServerCache } from '@/cache/next-server-cache';
import type { PageKey, SiteLocale } from '@/config/i18n';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import { PostgresFootballRepository } from '@/repositories/postgres-football.repository';
import { attachListingOdds } from '@/odds/listing';
import { requestCommercialGeo } from '@/odds/commercial-geo';
import { headers } from 'next/headers';
import { DatabaseM2ReadService, emptyDatabasePage } from './DatabaseM2ReadService';
import { M3RouteDataLoader } from './M3RouteDataLoader';

let runtime: M3RouteDataLoader | null = null;

function diagnostic(event: object): void {
  console.info(`[LivaSports M3] ${JSON.stringify(event)}`);
}

function getRuntime(): M3RouteDataLoader | null {
  if (runtime) return runtime;
  const connectionString = databaseUrl();
  if (!connectionString) return null;
  const database = new PostgresDatabaseClient(connectionString, metric => diagnostic(metric));
  const cache = new NextServerCache(event => diagnostic({ event: `cache-${event.event}`, key: event.key }));
  runtime = new M3RouteDataLoader(new DatabaseM2ReadService(new PostgresFootballRepository(database)), cache,
    undefined, undefined, metric => diagnostic(metric), { attach: async page => attachListingOdds(database, page, Date.now(), requestCommercialGeo(await headers())) });
  return runtime;
}

export function loadM3PageData(locale: SiteLocale, page: PageKey,selectedDate?:string,displayTimeZone?:string) {
  return getRuntime()?.load(locale, page,selectedDate,displayTimeZone) ?? Promise.resolve(emptyDatabasePage(locale, page));
}

export const getBrazilHomeData = () => loadM3PageData('br', 'home');
export const getBrazilFootballPage = () => loadM3PageData('br', 'football');
export const getBrazilTodayFixtures = () => loadM3PageData('br', 'today');
export const getBrazilLiveFixtures = () => loadM3PageData('br', 'live');
export const getMexicoHomeData = () => loadM3PageData('mx', 'home');
export const getMexicoFootballPage = () => loadM3PageData('mx', 'football');
export const getMexicoTodayFixtures = () => loadM3PageData('mx', 'today');
export const getMexicoLiveFixtures = () => loadM3PageData('mx', 'live');
