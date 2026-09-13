import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Cache, CacheEntryOptions, CacheResult } from './cache';
import { CacheCoordinator, MemoryCacheStore, type CacheEvent } from './cache';

export class NextServerCache implements Cache {
  private readonly memory: CacheCoordinator;

  constructor(onEvent: (event: CacheEvent) => void = () => undefined) {
    this.memory = new CacheCoordinator(new MemoryCacheStore(), onEvent);
  }

  get<T>(key: string): Promise<T | null> { return this.memory.get<T>(key); }
  set<T>(key: string, value: T, options: CacheEntryOptions): Promise<void> { return this.memory.set(key, value, options); }
  delete(key: string): Promise<void> { return this.memory.delete(key); }

  getOrSet<T>(key: string, options: CacheEntryOptions, loader: () => Promise<T>): Promise<CacheResult<T>> {
    // Keep process-local entries short so a ticker's cross-instance tag invalidation reaches readers promptly.
    return this.memory.getOrSet(key, {...options,ttlSeconds:Math.min(options.ttlSeconds,30)}, () => unstable_cache(loader, ['livasports', key], {
      revalidate: options.ttlSeconds,
      tags: [...new Set([key, ...(options.tags ?? [])])],
    })());
  }
}
