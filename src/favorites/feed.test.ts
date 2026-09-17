import {describe,expect,it} from 'vitest';
import {FixtureStatus} from '@/domain/enums';
import type {SportsFixture} from '@/sports/types';
import {dedupeMyMatches,favoriteReason,filterMyMatches,sortMyMatches,type MyMatchRow} from './feed';

function fixture(partial:Partial<SportsFixture>&Pick<SportsFixture,'id'|'publicId'|'status'|'kickoff'>):SportsFixture {
  return {competition:'League',competitionSlug:'premier-league',seasonId:null,round:null,stage:null,homeScore:null,awayScore:null,
    home:{id:'h',publicId:'aaaaaaaaaaaaaaaa',name:'Home',imageUrl:null},away:{id:'a',publicId:'bbbbbbbbbbbbbbbb',name:'Away',imageUrl:null},...partial};
}

describe('My Matches aggregation',()=>{
  it('deduplicates a fixture that matches fixture, team and competition favorites',()=>{
    const row=fixture({id:'1',publicId:'cccccccccccccccc',status:FixtureStatus.SCHEDULED,kickoff:'2026-09-18T15:00:00.000Z'});
    expect(favoriteReason(row,{version:1,teams:['aaaaaaaaaaaaaaaa'],competitions:['premier-league'],fixtures:['cccccccccccccccc']})).toBe('match');
    expect(dedupeMyMatches([{fixture:row,reason:'match'},{fixture:row,reason:'team'}])).toHaveLength(1);
  });

  it('prioritizes LIVE then upcoming kickoff then recent results',()=>{
    const live=fixture({id:'l',publicId:'1111111111111111',status:FixtureStatus.LIVE,kickoff:'2026-09-17T18:00:00.000Z'});
    const later=fixture({id:'u2',publicId:'2222222222222222',status:FixtureStatus.SCHEDULED,kickoff:'2026-09-19T18:00:00.000Z'});
    const soon=fixture({id:'u1',publicId:'3333333333333333',status:FixtureStatus.SCHEDULED,kickoff:'2026-09-18T12:00:00.000Z'});
    const old=fixture({id:'f',publicId:'4444444444444444',status:FixtureStatus.FINISHED,kickoff:'2026-09-16T12:00:00.000Z'});
    const sorted=sortMyMatches([{fixture:later,reason:'team'},{fixture:old,reason:'competition'},{fixture:live,reason:'match'},{fixture:soon,reason:'team'}]);
    expect(sorted.map(row=>row.fixture.id)).toEqual(['l','u1','u2','f']);
    expect(filterMyMatches(sorted,'live').map(row=>row.fixture.id)).toEqual(['l']);
    expect(filterMyMatches(sorted,'upcoming').map(row=>row.fixture.id)).toEqual(['u1','u2']);
    expect(filterMyMatches(sorted,'results').map(row=>row.fixture.id)).toEqual(['f']);
  });

  it('keeps an empty collection empty',()=>{
    const rows:MyMatchRow[]=[];
    expect(filterMyMatches(rows,'all')).toEqual([]);
  });
});
