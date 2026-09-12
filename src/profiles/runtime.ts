import 'server-only';
import { NextServerCache } from '@/cache/next-server-cache';
import { databaseUrl, PostgresDatabaseClient } from '@/database/client';
import type { SiteLocale } from '@/config/i18n';
import { ProfileLoader } from './loader';
import { PostgresProfileRepository } from './repository';

let repository: PostgresProfileRepository | null = null;
let loader: ProfileLoader | null = null;

function getRepository() {
  if (repository) return repository;
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error('Profile database is not configured');
  repository = new PostgresProfileRepository(new PostgresDatabaseClient(connectionString));
  return repository;
}
function getLoader() {
  loader ??= new ProfileLoader(getRepository(), new NextServerCache(event => {
    console.info(`[LivaSports M4.1] ${JSON.stringify({ event: `cache-${event.event}`, key: event.key })}`);
  }));
  return loader;
}

export async function loadTeamProfile(publicId: string, locale: SiteLocale) {
  const started = performance.now();
  try { return await getLoader().team(publicId, locale); }
  finally { console.info(`[LivaSports M4.1] ${JSON.stringify({ event: 'team-profile-load', publicId, locale,
    durationMs: Math.round((performance.now() - started) * 10) / 10, providerRequests: 0 })}`); }
}
export async function loadPlayerProfile(publicId: string, locale: SiteLocale) {
  const started = performance.now();
  try { return await getLoader().player(publicId, locale); }
  finally { console.info(`[LivaSports M4.1] ${JSON.stringify({ event: 'player-profile-load', publicId, locale,
    durationMs: Math.round((performance.now() - started) * 10) / 10, providerRequests: 0 })}`); }
}
export function loadSitemapTeams() { return getRepository().sitemapTeams(); }
export function loadSitemapPlayers() { return getRepository().sitemapPlayers(); }
