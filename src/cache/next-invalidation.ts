import 'server-only';
import { revalidateTag } from 'next/cache';
import type { CacheInvalidator } from './invalidation';

export class NextCacheInvalidator implements CacheInvalidator {
  constructor(private readonly immediate=false){}
  async invalidateTags(tags: readonly string[]): Promise<void> {
    for (const tag of new Set(tags)) revalidateTag(tag, this.immediate?{expire:0}:'max');
  }
}
