import { describe, expect, it } from 'vitest';
import { orderSportsSnapshots } from './ordering';
import type { SportsSnapshot } from './model';

// Only ordering metadata is exercised; these are not importable snapshots.
const snapshot = (season: string, mode: SportsSnapshot['mode'], observedAt: string, competitionId = 'nfl') => ({ competitionId, season, mode, observedAt, sourceId: 'wikimedia', sourceUrl: 'https://en.wikipedia.org' }) as SportsSnapshot;
describe('published snapshot edition selection', () => {
  it('prefers catalog season even when an archive revision is newer', () => {
    const current = snapshot('2026', 'manual', '2026-10-01T00:00:00Z'), archive = snapshot('2025', 'historical', '2026-10-19T00:00:00Z');
    expect(orderSportsSnapshots([archive, current])[0]).toBe(current);
  });
  it('compares equivalent season punctuation, then nonhistorical state', () => {
    const current = snapshot('2026/27', 'manual', '2026-10-01', 'nhl'), archive = snapshot('2026-27', 'historical', '2026-10-19', 'nhl');
    expect(orderSportsSnapshots([archive, current])[0]).toBe(current);
  });
  it('falls back to nonhistorical, latest edition, then observed date without mutating input', () => {
    const old = snapshot('2023', 'manual', '2026-10-19'), recent = snapshot('2024', 'manual', '2026-10-01'), archive = snapshot('2025', 'historical', '2026-10-19');
    const input = [old, archive, recent];
    expect(orderSportsSnapshots(input)).toEqual([recent, old, archive]); expect(input).toEqual([old, archive, recent]);
    const newer = { ...recent, observedAt: '2026-10-02' };
    expect(orderSportsSnapshots([recent, newer])[0]).toBe(newer);
  });
});
