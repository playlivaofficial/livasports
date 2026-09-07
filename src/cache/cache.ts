export interface CacheEntryOptions { ttlSeconds: number; staleIfErrorSeconds?: number; tags?: readonly string[]; }
export type CacheResultStatus = 'HIT' | 'MISS' | 'DEDUPLICATED' | 'STALE';
export interface CacheResult<T> { value: T; status: CacheResultStatus; }
export interface CacheEvent { event: 'hit' | 'miss' | 'deduplicated' | 'stale' | 'set' | 'delete'; key: string; }

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options: CacheEntryOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Cache extends CacheStore {
  getOrSet<T>(key: string, options: CacheEntryOptions, loader: () => Promise<T>): Promise<CacheResult<T>>;
}

interface MemoryEntry { value: unknown; expiresAt: number; }
interface StaleEntry extends MemoryEntry { staleUntil: number; }

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>();
  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options: CacheEntryOptions): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + options.ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> { this.entries.delete(key); }
}

export class CacheCoordinator implements Cache {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly stale = new Map<string, StaleEntry>();

  constructor(
    private readonly cache: CacheStore,
    private readonly onEvent: (event: CacheEvent) => void = () => undefined,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string): Promise<T | null> { return this.cache.get<T>(key); }

  async set<T>(key: string, value: T, options: CacheEntryOptions): Promise<void> {
    await this.cache.set(key, value, options);
    this.stale.set(key, { value, expiresAt: this.now() + options.ttlSeconds * 1000,
      staleUntil: this.now() + (options.ttlSeconds + (options.staleIfErrorSeconds ?? 0)) * 1000 });
    this.onEvent({ event: 'set', key });
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
    this.stale.delete(key);
    this.onEvent({ event: 'delete', key });
  }

  async getOrSet<T>(key: string, options: CacheEntryOptions, loader: () => Promise<T>): Promise<CacheResult<T>> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.onEvent({ event: 'hit', key });
      return { value: cached, status: 'HIT' };
    }
    const active = this.inFlight.get(key) as Promise<T> | undefined;
    if (active) {
      this.onEvent({ event: 'deduplicated', key });
      return { value: await active, status: 'DEDUPLICATED' };
    }
    this.onEvent({ event: 'miss', key });
    const promise = loader().then(async value => {
      await this.set(key, value, options);
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    try {
      return { value: await promise, status: 'MISS' };
    } catch (error) {
      const stale = this.stale.get(key);
      if (stale && stale.staleUntil > this.now()) {
        this.onEvent({ event: 'stale', key });
        return { value: stale.value as T, status: 'STALE' };
      }
      throw error;
    }
  }

  async getOrLoad<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    return (await this.getOrSet(key, { ttlSeconds }, loader)).value;
  }
}
