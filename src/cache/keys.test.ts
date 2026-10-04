import { describe, expect, it } from 'vitest';
import { cacheKeys, fixtureChangeTags, routeCacheTags } from './keys';

describe('cache keys', () => {
  it('are deterministic, namespaced, and normalize entity IDs', () => {
    expect(cacheKeys.routeData('br', 'today', '2026-09-07')).toBe('livasports:v1:route:v4:br:today:2026-09-07');
    expect(cacheKeys.routeData('co', 'today', '2026-09-07')).not.toBe(cacheKeys.routeData('pe', 'today', '2026-09-07'));
    expect(cacheKeys.fixture(' ABC 123 ')).toBe('livasports:v1:fixture:abc-123');
    expect(routeCacheTags('mx', 'live')).toContain('livasports:v1:fixtures:live:mx');
  });

  it('invalidates only fixture-related route and entity tags', () => {
    const tags = fixtureChangeTags(['fixture-a', 'fixture-a']);
    expect(tags.filter(tag => tag.endsWith('fixture-a'))).toHaveLength(1);
    expect(tags).not.toContain('livasports:v1');
    expect(tags).toContain('livasports:v1:fixtures:co');expect(tags).toContain('livasports:v1:fixtures:pe');
  });
});
