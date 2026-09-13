import {describe,it,expect} from 'vitest';
import {boardDate,matchesView,boardSort} from './board-policy';
import type {FixtureView} from '@/delivery/types';
import {FixtureStatus} from '@/domain/enums';
describe('football board navigation',()=>{
  it('accepts real bounded calendar dates and rejects normalized impossible dates',()=>{
    expect(boardDate('2026-09-18','2026-09-13')).toBe('2026-09-18');
    for(const date of ['2026-02-31','2026-11-30','2026-09-01','bad'])expect(boardDate(date,'2026-09-13')).toBeUndefined();
  });
  it('does not label a past scheduled match as live or a result without a saved status',()=>{
    const now=Date.parse('2026-09-13T18:00Z');
    const f={id:'one',status:'SCHEDULED',kickoff:'2026-09-13T16:00Z'} as FixtureView;
    expect(matchesView(f,'all',now)).toBe(true);
    for(const view of ['live','upcoming','results'] as const)expect(matchesView(f,view,now)).toBe(false);
    expect(boardSort({...f,status:FixtureStatus.LIVE},f,now)).toBeLessThan(0);
  });
});
