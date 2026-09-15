import {describe,it,expect} from 'vitest';
import {boardDate,boardView,hasPregameOddsLayout,matchesView,boardSort} from './board-policy';
import type {FixtureView} from '@/delivery/types';
import {FixtureStatus} from '@/domain/enums';
describe('football board navigation',()=>{
  it('defaults a neutral home to Upcoming while preserving every explicit filter',()=>{
    expect(boardView(undefined,'upcoming')).toBe('upcoming');
    for(const view of ['all','live','upcoming','results'] as const)expect(boardView(view,'upcoming')).toBe(view);
  });
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
  it('reserves an odds column only when a group has a future scheduled fixture',()=>{
    const now=Date.parse('2026-09-15T12:00:00Z');
    const fixture=(status:FixtureStatus,kickoff='2026-09-15T13:00:00Z')=>({status,kickoff}) as FixtureView;
    expect(hasPregameOddsLayout([fixture(FixtureStatus.FINISHED)],now)).toBe(false);
    expect(hasPregameOddsLayout([fixture(FixtureStatus.LIVE)],now)).toBe(false);
    expect(hasPregameOddsLayout([fixture(FixtureStatus.SCHEDULED,'2026-09-15T11:00:00Z')],now)).toBe(false);
    expect(hasPregameOddsLayout([fixture(FixtureStatus.FINISHED),fixture(FixtureStatus.SCHEDULED)],now)).toBe(true);
  });
});
