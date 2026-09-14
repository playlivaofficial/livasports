import {describe,it,expect} from 'vitest';
import {boardDate,matchesView,boardSort} from './board-policy';
import type {FixtureView} from '@/delivery/types';
import {FixtureStatus} from '@/domain/enums';
describe('football board navigation',()=>{
  it('accepts real bounded calendar dates and rejects normalized impossible dates',()=>{
    expect(boardDate('2026-09-18','2026-09-13')).toBe('2026-09-18');
    for(const date of ['2026-02-31','2300-11-30','bad'])expect(boardDate(date,'2026-09-13')).toBeUndefined();
    expect(boardDate('2024-09-01','2026-09-13',{from:'2024-01-01',to:'2027-05-01'})).toBe('2024-09-01');
    expect(boardDate('2023-12-31','2026-09-13',{from:'2024-01-01',to:'2027-05-01'})).toBeUndefined();
  });
  it('does not label a past scheduled match as live or a result without a saved status',()=>{
    const now=Date.parse('2026-09-13T18:00Z');
    const f={id:'one',status:'SCHEDULED',kickoff:'2026-09-13T16:00Z'} as FixtureView;
    expect(matchesView(f,'all',now)).toBe(true);
    for(const view of ['live','upcoming','results'] as const)expect(matchesView(f,view,now)).toBe(false);
    expect(boardSort({...f,status:FixtureStatus.LIVE},f,now)).toBeLessThan(0);
  });
});
