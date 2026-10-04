import {FixtureStatus} from '@/domain/enums';
import type {MatchHeaderView} from './types';

/** Odds never share this cache. A ticker can invalidate any shell before its TTL. */
export function publicMatchRevalidate(header: Pick<MatchHeaderView, 'status' | 'kickoff'> | null, now = Date.now()): number {
  if (!header) return 300;
  if (header.status === FixtureStatus.LIVE || header.status === FixtureStatus.HALFTIME) return 30;
  if ([FixtureStatus.FINISHED, FixtureStatus.CANCELLED, FixtureStatus.ABANDONED].includes(header.status)) {
    return now - Date.parse(header.kickoff) >= 7 * 86400_000 ? 86400 : 3600;
  }
  // Keep kickoff/status transitions prompt even if the ticker is temporarily delayed.
  if (Math.abs(Date.parse(header.kickoff) - now) <= 3 * 3600_000) return 60;
  return 300;
}

export function shouldCheckMatchSnapshot(status: string, kickoff: string, now = Date.now()): boolean {
  const kickoffAt=Date.parse(kickoff);
  return status === FixtureStatus.LIVE || status === FixtureStatus.HALFTIME
    || (status === FixtureStatus.SCHEDULED && now >= kickoffAt - 5 * 60_000 && now <= kickoffAt + 6 * 3600_000);
}

export interface PublicMatchSnapshot {status?: string;snapshotAt?: string | null;providerUpdatedAt?: string | null;}
export function matchSnapshotChanged(previous: PublicMatchSnapshot, next: PublicMatchSnapshot): boolean {
  return Boolean((next.status && next.status !== previous.status)
    || (next.snapshotAt && next.snapshotAt !== previous.snapshotAt)
    || (next.providerUpdatedAt && next.providerUpdatedAt !== previous.providerUpdatedAt));
}
