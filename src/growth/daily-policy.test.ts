import {describe,it,expect} from 'vitest';
import {growthLocalDay,nextGrowthCheck} from './daily-policy';
describe('independent daily cycles and hourly replacement',()=>{
 it('uses the correct local date on each side of the Mexico/Andean midnight boundary',()=>{
  const now=new Date('2026-10-14T05:30:00Z');expect(growthLocalDay('MX',now)).toBe('2026-10-13');expect(growthLocalDay('CO',now)).toBe('2026-10-14');expect(growthLocalDay('PE',now)).toBe('2026-10-14');
 });
 it('always reports the next hourly check strictly after now',()=>{
  expect(nextGrowthCheck(new Date('2026-10-14T06:16:00Z'))).toBe('2026-10-14T06:17:00.000Z');expect(nextGrowthCheck(new Date('2026-10-14T06:17:00Z'))).toBe('2026-10-14T07:17:00.000Z');
 });
});
