import { describe, expect, it } from 'vitest';
import { canonicalSelectionKey, eventMinute, isLiveSnapshotStale, isPregameActionable, latestSnapshotAt, numericOrMissing } from './rules';

describe('Match Center domain rules', () => {
  it('formats stoppage time without losing the regulation minute', () => expect(eventMinute(45,2)).toBe('45+2’'));
  it('preserves real zero while keeping missing values null', () => { expect(numericOrMissing(0)).toBe(0); expect(numericOrMissing(undefined)).toBeNull(); });
  it('makes pregame prices non-actionable at kickoff', () => {
    expect(isPregameActionable('2026-09-08T18:00:01Z',new Date('2026-09-08T18:00:00Z'))).toBe(true);
    expect(isPregameActionable('2026-09-08T18:00:00Z',new Date('2026-09-08T18:00:00Z'))).toBe(false);
  });
  it('requires fixture, period, market, outcome, line and settlement scope for comparison identity', () => {
    const base={fixtureId:'fixture',period:'FULL_TIME',market:'TOTAL_GOALS',outcome:'OVER',line:2.5,settlementScope:'REGULATION'};
    expect(canonicalSelectionKey(base)).not.toBe(canonicalSelectionKey({...base,line:3.5}));
    expect(canonicalSelectionKey(base)).not.toBe(canonicalSelectionKey({...base,period:'FIRST_HALF'}));
  });
  it('marks delayed live snapshots stale without aging immutable final snapshots', () => {
    const now = new Date('2026-09-08T18:02:00Z');
    expect(isLiveSnapshotStale('LIVE','2026-09-08T18:00:00Z',now)).toBe(true);
    expect(isLiveSnapshotStale('HALFTIME','2026-09-08T18:01:00Z',now)).toBe(false);
    expect(isLiveSnapshotStale('LIVE',null,now)).toBe(true);
    expect(isLiveSnapshotStale('FINISHED','2020-01-01T00:00:00Z',now)).toBe(false);
  });
  it('uses the newest durable database snapshot as the live refresh token', () => {
    expect(latestSnapshotAt([null,'2026-09-08T18:00:00.000Z','invalid','2026-09-08T18:01:00.000Z'])).toBe('2026-09-08T18:01:00.000Z');
    expect(latestSnapshotAt([null])).toBeNull();
  });
});
