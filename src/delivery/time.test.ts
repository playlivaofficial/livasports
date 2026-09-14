import { describe, expect, it } from 'vitest';
import { belongsToLocalDay, localDayRange,localDateKey,zonedDateTimeToUtc } from './time';

describe('localized calendar-day policy', () => {
  it.each(['Pacific/Kiritimati','Pacific/Pago_Pago','Asia/Tokyo','Europe/London','America/Tijuana','Australia/Sydney'])('keeps an explicit date and the next boundary in %s',zone=>{
    const noon=zonedDateTimeToUtc({year:2026,month:9,day:14,hour:12},zone);
    const range=localDayRange(noon,zone);
    expect(localDateKey(noon,zone)).toBe('2026-09-14');
    expect(localDateKey(range.from,zone)).toBe('2026-09-14');
    expect(localDateKey(new Date(range.to.getTime()-1),zone)).toBe('2026-09-14');
    expect(localDateKey(range.to,zone)).toBe('2026-09-15');
  });
  it.each([['2026-03-08T12:00:00Z',23],['2026-11-01T12:00:00Z',25]] as const)('handles a daylight-saving transition on %s', (date,hours)=>{
    const range=localDayRange(new Date(date),'America/New_York');expect((range.to.getTime()-range.from.getTime())/3600000).toBe(hours);
  });
  it('uses São Paulo boundaries instead of the server UTC day', () => {
    const reference = new Date('2026-09-08T02:30:00Z'); // Sep 7, 23:30 in São Paulo
    expect(belongsToLocalDay(new Date('2026-09-07T04:00:00Z'), reference, 'America/Sao_Paulo')).toBe(true);
    expect(belongsToLocalDay(new Date('2026-09-08T03:01:00Z'), reference, 'America/Sao_Paulo')).toBe(false);
    expect(localDayRange(reference, 'America/Sao_Paulo')).toEqual({
      from: new Date('2026-09-07T03:00:00Z'), to: new Date('2026-09-08T03:00:00Z'),
    });
  });

  it('uses Mexico City boundaries independently', () => {
    const reference = new Date('2026-09-08T04:30:00Z'); // Sep 7, 22:30 in Mexico City
    expect(belongsToLocalDay(new Date('2026-09-07T06:30:00Z'), reference, 'America/Mexico_City')).toBe(true);
    expect(belongsToLocalDay(new Date('2026-09-08T06:01:00Z'), reference, 'America/Mexico_City')).toBe(false);
  });
});
