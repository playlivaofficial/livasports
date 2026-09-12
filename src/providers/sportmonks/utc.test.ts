import { describe,it,expect } from 'vitest';
import { sportmonksUtc } from './utc';
describe('Sportmonks UTC parsing',()=>{
  it('does not interpret bare provider dates in the worker timezone',()=>{
    expect(sportmonksUtc('2026-09-12 19:00:00').toISOString()).toBe('2026-09-12T19:00:00.000Z');
    expect(sportmonksUtc('2026-09-12T19:00:00Z').toISOString()).toBe('2026-09-12T19:00:00.000Z');
    expect(sportmonksUtc('2026-09-12T19:00:00-03:00').toISOString()).toBe('2026-09-12T22:00:00.000Z');
  });
  it('prefers the unambiguous provider epoch and rejects invalid dates',()=>{
    expect(sportmonksUtc('2026-09-12 15:00:00',1789239600).toISOString()).toBe('2026-09-12T19:00:00.000Z');
    expect(()=>sportmonksUtc('invalid')).toThrow();
  });
});
