import {describe,it,expect} from 'vitest';
import {HOME_WINDOW_DAYS,weekHomeSections} from './home-density';
import {localDaysRange} from '@/delivery/time';
import type {CompetitionSectionView,FixtureView} from '@/delivery/types';
const now=Date.parse('2026-09-22T12:00:00Z');
const fixture=(id:string,status:string,kickoff:string)=>({id,status,kickoff}) as FixtureView;
const section=(slug:string,fixtures:FixtureView[]):CompetitionSectionView=>({slug,competition:slug,priority:1,group:'Brazil',fixtures});
const range=(zone:string,at=now)=>{const r=localDaysRange(new Date(at),zone,HOME_WINDOW_DAYS);return {from:r.from.getTime(),to:r.to.getTime()};};
describe('default homepage = next seven days',()=>{
  it('shows tomorrow and later fixtures when today has none (empty today is not an empty week)',()=>{
    const out=weekHomeSections([section('mls',[fixture('a','SCHEDULED','2026-09-24T23:30:00Z'),fixture('b','SCHEDULED','2026-09-23T00:30:00Z')])],range('America/Sao_Paulo'),now);
    expect(out.flatMap(s=>s.fixtures.map(f=>f.id))).toEqual(['b','a']);
    expect(out.filter(s=>s.fixtures.some(f=>f.kickoff.startsWith('2026-09-22')))).toHaveLength(0);
  });
  it('excludes yesterday and anything from day eight onwards; day seven (local) is the last included day',()=>{
    const r=range('America/Sao_Paulo');
    const out=weekHomeSections([section('x',[fixture('yesterday','FINISHED','2026-09-22T01:00:00Z'),fixture('day7','SCHEDULED','2026-09-29T02:59:00Z'),fixture('day8','SCHEDULED','2026-09-29T03:00:00Z'),fixture('today','SCHEDULED','2026-09-22T20:00:00Z')])],r,now);
    expect(out[0].fixtures.map(f=>f.id)).toEqual(['today','day7']);
  });
  it('orders live first, then chronologically, and competitions by first kickoff; drops empty competitions',()=>{
    const out=weekHomeSections([
      section('later',[fixture('l1','SCHEDULED','2026-09-25T18:00:00Z')]),
      section('empty',[fixture('old','FINISHED','2026-09-20T18:00:00Z')]),
      section('now',[fixture('u','SCHEDULED','2026-09-22T18:00:00Z'),fixture('live','LIVE','2026-09-22T11:30:00Z'),fixture('done','FINISHED','2026-09-22T08:00:00Z')]),
    ],range('Europe/Lisbon'),now);
    expect(out.map(s=>s.slug)).toEqual(['now','later']);
    expect(out[0].fixtures.map(f=>f.id)).toEqual(['live','u','done']);
  });
  it('returns a legitimate empty state when nothing is scheduled within the window',()=>{
    expect(weekHomeSections([section('x',[fixture('far','SCHEDULED','2026-10-10T18:00:00Z')])],range('America/Sao_Paulo'),now)).toEqual([]);
  });
  it('spans month-end, year-end and DST changes as seven local calendar days',()=>{
    const days=(zone:string,at:string)=>{const r=localDaysRange(new Date(at),zone,HOME_WINDOW_DAYS);return [r.from.toISOString(),r.to.toISOString()];};
    expect(days('UTC','2026-09-28T23:59:59Z')).toEqual(['2026-09-28T00:00:00.000Z','2026-10-05T00:00:00.000Z']);
    expect(days('America/Sao_Paulo','2026-12-30T12:00:00Z')).toEqual(['2026-12-30T03:00:00.000Z','2027-01-06T03:00:00.000Z']);
    // US DST ends 2026-11-01: the window keeps local midnights (25-hour day inside), not 7x24h.
    expect(days('America/New_York','2026-10-29T12:00:00Z')).toEqual(['2026-10-29T04:00:00.000Z','2026-11-05T05:00:00.000Z']);
    // Europe DST ends 2026-10-25.
    expect(days('Europe/Lisbon','2026-10-20T12:00:00Z')).toEqual(['2026-10-19T23:00:00.000Z','2026-10-27T00:00:00.000Z']);
    expect(days('America/Mexico_City','2026-02-26T12:00:00Z')).toEqual(['2026-02-26T06:00:00.000Z','2026-03-05T06:00:00.000Z']);
  });
});
