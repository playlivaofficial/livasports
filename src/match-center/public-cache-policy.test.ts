import {describe,expect,it} from 'vitest';
import {FixtureStatus} from '@/domain/enums';
import {matchSnapshotChanged,publicMatchRevalidate,shouldCheckMatchSnapshot} from './public-cache-policy';

const now=Date.parse('2026-10-04T12:00:00Z');
const header=(status:FixtureStatus,hours:number)=>({status,kickoff:new Date(now+hours*3600_000).toISOString()});
describe('public match ISR policy',()=>{
  it('keeps noncommercial SEO shells longer without caching live odds',()=>{
    expect(publicMatchRevalidate(header(FixtureStatus.SCHEDULED,24),now)).toBe(300);
    expect(publicMatchRevalidate(header(FixtureStatus.SCHEDULED,1),now)).toBe(60);
    expect(publicMatchRevalidate(header(FixtureStatus.LIVE,0),now)).toBe(30);
    expect(publicMatchRevalidate(header(FixtureStatus.HALFTIME,0),now)).toBe(30);
    expect(publicMatchRevalidate(header(FixtureStatus.FINISHED,-2),now)).toBe(3600);
    expect(publicMatchRevalidate(header(FixtureStatus.FINISHED,-24*8),now)).toBe(86400);
    expect(publicMatchRevalidate(header(FixtureStatus.CANCELLED,-24*8),now)).toBe(86400);
    expect(publicMatchRevalidate(null,now)).toBe(300);
  });
  it('checks a cached scheduled page at kickoff instead of staying scheduled forever',()=>{
    const kickoff=new Date(now).toISOString();
    expect(shouldCheckMatchSnapshot('SCHEDULED',kickoff,now-10*60_000)).toBe(false);
    expect(shouldCheckMatchSnapshot('SCHEDULED',kickoff,now-5*60_000)).toBe(true);
    expect(shouldCheckMatchSnapshot('LIVE',kickoff,now)).toBe(true);
    expect(shouldCheckMatchSnapshot('HALFTIME',kickoff,now)).toBe(true);
    expect(shouldCheckMatchSnapshot('FINISHED',kickoff,now)).toBe(false);
    expect(shouldCheckMatchSnapshot('SCHEDULED',kickoff,now+24*3600_000)).toBe(false);
  });
  it('refreshes score-only changes even when module snapshots and live status stay the same',()=>{
    const previous={status:'LIVE',snapshotAt:'2026-10-04T12:00:00Z',providerUpdatedAt:'2026-10-04T12:00:00Z'};
    expect(matchSnapshotChanged(previous,{...previous,providerUpdatedAt:'2026-10-04T12:04:00Z'})).toBe(true);
    expect(matchSnapshotChanged(previous,{...previous,status:'FINISHED'})).toBe(true);
    expect(matchSnapshotChanged(previous,{...previous,snapshotAt:'2026-10-04T12:02:00Z'})).toBe(true);
    expect(matchSnapshotChanged(previous,previous)).toBe(false);
    expect(matchSnapshotChanged(previous,{})).toBe(false);
  });
});
