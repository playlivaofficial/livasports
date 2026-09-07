import 'server-only';
import { revalidateTag } from 'next/cache';
import type { CacheInvalidator } from './invalidation';

export class NextCacheInvalidator implements CacheInvalidator {
  async invalidateTags(tags: readonly string[]): Promise<void> {
    for (const tag of new Set(tags)) revalidateTag(tag, 'max');
  }
}
