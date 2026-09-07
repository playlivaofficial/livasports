import { describe, expect, it } from 'vitest';
import { CacheCoordinator, MemoryCacheStore } from './cache';

describe('cache coordinator', () => {
  it('deduplicates simultaneous provider loads', async () => {
    const coordinator = new CacheCoordinator(new MemoryCacheStore());
    let calls = 0;
    const loader = async () => { calls++; return { fixtures: 10 }; };
    const [first, second] = await Promise.all([
      coordinator.getOrLoad('fixture:1', 60, loader), coordinator.getOrLoad('fixture:1', 60, loader),
    ]);
    expect(first).toEqual(second);
    expect(calls).toBe(1);
  });

  it('supports deterministic get, set, hit, miss, and delete paths', async () => {
    const events: string[] = [];
    const coordinator = new CacheCoordinator(new MemoryCacheStore(), event => events.push(event.event));
    await expect(coordinator.get('missing')).resolves.toBeNull();
    const first = await coordinator.getOrSet('route:br', { ttlSeconds: 60 }, async () => 7);
    const second = await coordinator.getOrSet('route:br', { ttlSeconds: 60 }, async () => 8);
    expect(first).toEqual({ value: 7, status: 'MISS' });
    expect(second).toEqual({ value: 7, status: 'HIT' });
    expect(events).toContain('miss');
    expect(events).toContain('hit');
    await coordinator.delete('route:br');
    await expect(coordinator.get('route:br')).resolves.toBeNull();
  });

  it('serves a bounded stale value when refresh fails', async () => {
    let time = 0;
    const now = () => time;
    const coordinator = new CacheCoordinator(new MemoryCacheStore(now), () => undefined, now);
    await coordinator.getOrSet('fixtures:today:br', { ttlSeconds: 1, staleIfErrorSeconds: 10 }, async () => 'fresh');
    time = 2_000;
    const result = await coordinator.getOrSet('fixtures:today:br', { ttlSeconds: 1, staleIfErrorSeconds: 10 }, async () => { throw new Error('db unavailable'); });
    expect(result).toEqual({ value: 'fresh', status: 'STALE' });
  });
});
