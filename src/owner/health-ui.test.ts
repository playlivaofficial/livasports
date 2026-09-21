import {afterEach,expect,it,vi} from 'vitest';
import {healthRelativeTime} from './health-ui';
afterEach(()=>vi.useRealTimers());
it('renders snapshot-relative times identically across SSR and hydration clock boundaries',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T12:00:29Z'));
  const server=healthRelativeTime('2026-09-21T12:00:29Z');
  const before=[server.ago('2026-09-21T12:00:00Z'),server.until('2026-09-21T12:01:00Z')];
  vi.setSystemTime(new Date('2026-09-21T12:00:35Z'));
  const client=healthRelativeTime('2026-09-21T12:00:29Z');
  expect([client.ago('2026-09-21T12:00:00Z'),client.until('2026-09-21T12:01:00Z')]).toEqual(before);
  expect(client.ago(null)).toBe('—');expect(client.until(null)).toBe('—');
});
