import {describe,it,expect} from 'vitest';
import {FIXTURE_SYNC_INTERVAL_MINUTES,FIXTURE_SYNC_WINDOW,fixtureSyncDue} from './fixture-ticker';
describe('automatic fixture ingestion cadence (production had no scheduler: last sync 2026-09-14)',()=>{
  const now=Date.parse('2026-09-22T09:00Z');
  it('runs when never synced, when the last success is older than six hours, and skips fresh syncs',()=>{
    expect(fixtureSyncDue(undefined,now)).toBe(true);
    expect(fixtureSyncDue({status:'SUCCEEDED',started_at:new Date(now-5*3600000)},now)).toBe(false);
    expect(fixtureSyncDue({status:'SUCCEEDED',started_at:new Date(now-FIXTURE_SYNC_INTERVAL_MINUTES*60000)},now)).toBe(true);
    expect(fixtureSyncDue({status:'SUCCEEDED',started_at:new Date(now-8*86400000)},now)).toBe(true);
  });
  it('backs off bounded after failures and for a day after an authentication rejection; a stuck RUNNING row is retried after the cooldown',()=>{
    expect(fixtureSyncDue({status:'FAILED',started_at:new Date(now-10*60000),error_message:'SPORTMONKS 500'},now)).toBe(false);
    expect(fixtureSyncDue({status:'FAILED',started_at:new Date(now-31*60000),error_message:'SPORTMONKS 500'},now)).toBe(true);
    expect(fixtureSyncDue({status:'FAILED',started_at:new Date(now-6*3600000),error_message:'SPORTMONKS 401 invalid token'},now)).toBe(false);
    expect(fixtureSyncDue({status:'RUNNING',started_at:new Date(now-2*60000)},now)).toBe(false);
    expect(fixtureSyncDue({status:'RUNNING',started_at:new Date(now-45*60000)},now)).toBe(true);
  });
  it('covers three weeks ahead so the next-7-days view never depends on a manual run',()=>{
    expect(FIXTURE_SYNC_WINDOW.daysFuture).toBeGreaterThanOrEqual(14);expect(FIXTURE_SYNC_WINDOW.daysPast).toBeGreaterThanOrEqual(1);
  });
});
