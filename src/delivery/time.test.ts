import { describe, expect, it } from 'vitest';
import { belongsToLocalDay, localDayRange } from './time';

describe('localized calendar-day policy', () => {
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
