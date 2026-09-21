import {describe,it,expect} from 'vitest';
import {denseHomeSections} from './home-density';
import type {CompetitionSectionView,FixtureView} from '@/delivery/types';
const now=Date.parse('2026-09-21T12:00:00Z');
const fixture=(id:string,status:string,kickoff='2026-09-21T18:00:00Z')=>({id,status,kickoff}) as FixtureView;
const sections=(fixtures:FixtureView[]):CompetitionSectionView[]=>[{slug:'league',competition:'League',priority:1,group:'Brazil',fixtures}];
describe('sparse default homepage',()=>{
  it('shows today then tomorrow then results without duplicating fixtures',()=>{
    const today=sections([fixture('today','SCHEDULED'),fixture('finished','FINISHED')]);
    const tomorrow=sections([fixture('next','SCHEDULED','2026-09-22T18:00:00Z'),fixture('today','SCHEDULED')]);
    const groups=denseHomeSections(today,tomorrow,now);
    expect(groups.map(g=>g.homePeriod)).toEqual(['upcoming','tomorrow','results']);
    expect(groups.flatMap(g=>g.fixtures.map(f=>f.id))).toEqual(['today','next','finished']);
  });
  it('shows tomorrow before finished today when no upcoming match remains',()=>{
    expect(denseHomeSections(sections([fixture('result','FINISHED')]),sections([fixture('next','SCHEDULED','2026-09-22T18:00:00Z')]),now).map(g=>g.homePeriod)).toEqual(['tomorrow','results']);
  });
  it('places live first and does not append tomorrow when four useful rows exist',()=>{
    const result=denseHomeSections(sections([fixture('live','LIVE'),...['1','2','3'].map(id=>fixture(id,'SCHEDULED'))]),sections([fixture('next','SCHEDULED')]),now);
    expect(result.map(g=>g.homePeriod)).toEqual(['live','upcoming']);expect(result.flatMap(g=>g.fixtures)).toHaveLength(4);
  });
});
