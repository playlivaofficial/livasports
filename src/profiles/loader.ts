import 'server-only';
import type { Cache } from '@/cache/cache';
import { cacheKeys } from '@/cache/keys';
import type { SiteLocale } from '@/config/i18n';
import type { PlayerProfileReadResult, TeamProfileReadResult } from './types';
import type { PostgresProfileRepository } from './repository';

export class ProfileLoader {
  constructor(private readonly repository: PostgresProfileRepository, private readonly cache: Cache) {}

  async team(publicId: string, locale: SiteLocale): Promise<TeamProfileReadResult> {
    const result = await this.cache.getOrSet(cacheKeys.teamProfile(publicId, locale), { ttlSeconds: 300,
      staleIfErrorSeconds: 24 * 60 * 60, tags: [cacheKeys.teamProfileTag(publicId)] }, () => this.repository.team(publicId, locale));
    return result.value ? { kind: 'found', profile: result.value } : { kind: 'not-found' };
  }

  async player(publicId: string, locale: SiteLocale): Promise<PlayerProfileReadResult> {
    const result = await this.cache.getOrSet(cacheKeys.playerProfile(publicId, locale), { ttlSeconds: 300,
      staleIfErrorSeconds: 24 * 60 * 60, tags: [cacheKeys.playerProfileTag(publicId)] }, () => this.repository.player(publicId, locale));
    return result.value ? { kind: 'found', profile: result.value } : { kind: 'not-found' };
  }
}
