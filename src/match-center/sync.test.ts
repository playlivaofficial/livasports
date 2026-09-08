import { describe, expect, it } from 'vitest';
import { canResumeSyncJob } from './sync';

describe('Match Center sync recovery', () => {
  const now = new Date('2026-09-08T18:00:00Z');
  it('resumes a failed partial batch at its durable cursor', () => {
    expect(canResumeSyncJob({ status:'FAILED',resumeCursor:2,leaseExpiresAt:now },5,now)).toBe(true);
  });
  it('reclaims an expired lease, including the standings phase after all fixtures', () => {
    expect(canResumeSyncJob({ status:'RUNNING',resumeCursor:5,leaseExpiresAt:new Date('2026-09-08T17:59:59Z') },5,now)).toBe(true);
  });
  it('never takes over an active job or reuses an empty checkpoint', () => {
    expect(canResumeSyncJob({ status:'RUNNING',resumeCursor:2,leaseExpiresAt:new Date('2026-09-08T18:01:00Z') },5,now)).toBe(false);
    expect(canResumeSyncJob({ status:'FAILED',resumeCursor:0,leaseExpiresAt:now },5,now)).toBe(false);
  });
});
