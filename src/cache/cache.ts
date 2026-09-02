export interface CacheEntryOptions { ttlSeconds: number; }

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options: CacheEntryOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

interface MemoryEntry { value: unknown; expiresAt: number; }

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options: CacheEntryOptions): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + options.ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> { this.entries.delete(key); }
}

export class CacheCoordinator {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  constructor(private readonly cache: CacheStore) {}

  async getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== null) return cached;
    const active = this.inFlight.get(key) as Promise<T> | undefined;
    if (active) return active;
    const promise = loader().then(async value => {
      await this.cache.set(key, value, { ttlSeconds });
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}
