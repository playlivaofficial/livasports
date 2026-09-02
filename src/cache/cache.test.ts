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
});
