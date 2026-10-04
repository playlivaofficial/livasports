import {describe,expect,it} from 'vitest';
import {foldSearchText,moveSearchActive,rankSportsSearch,SEARCH_SUGGESTION_LIMIT} from './search-rank';
import type {SportsSearchResult} from './types';
import type {Geo} from '@/config/geo';

function row(kind:SportsSearchResult['kind'],name:string,slug:string|null=null):SportsSearchResult {
  return {kind,publicId:slug??name,name,context:null,slug,countryCode:null,countryName:null,region:null,imageUrl:null};
}

describe('sports autocomplete ranking',()=>{
  it('is accent-insensitive and prefix-based',()=>{
    expect(foldSearchText('São Paulo')).toBe('sao paulo');
    const rows=[row('team','São Paulo','sao'),row('team','Santos','santos'),row('competition','Brasileirão Série A','brasileirao-serie-a')];
    expect(rankSportsSearch(rows,'sao').map(r=>r.name)).toEqual(['São Paulo']);
    expect(rankSportsSearch(rows,'bra').map(r=>r.name)).toEqual(['Brasileirão Série A']);
  });
  it('returns at most five suggestions with competitions before teams and players',()=>{
    const rows=[
      row('player','Bruno Fernandes','p1'),row('player','Braithwaite','p2'),row('team','Braga','t1'),row('team','Bragantino','t2'),
      row('competition','Brasileirão Série A','brasileirao-serie-a'),row('competition','Brasileirão Série B','brasileirao-serie-b'),
      row('team','Barcelona','t3'),
    ];
    const ranked=rankSportsSearch(rows,'bra');
    expect(ranked).toHaveLength(SEARCH_SUGGESTION_LIMIT);
    expect(ranked.map(r=>r.name)).toEqual(['Brasileirão Série A','Brasileirão Série B','Braga','Bragantino','Braithwaite']);
    expect(rankSportsSearch(rows,'zzzz')).toEqual([]);
  });
  it('keeps flamengo-style prefixes and ignores non-prefix contains matches',()=>{
    const rows=[row('team','Flamengo'),row('player','Vinicius Junior'),row('team','Fluminense'),row('competition','Copa do Brasil','copa-do-brasil')];
    expect(rankSportsSearch(rows,'flam').map(r=>r.name)).toEqual(['Flamengo']);
    expect(rankSportsSearch(rows,'vin').map(r=>r.name)).toEqual(['Vinicius Junior']);
    expect(rankSportsSearch(rows,'sil').map(r=>r.name)).toEqual([]);
  });
  it('moves keyboard highlight within the visible list',()=>{
    expect(moveSearchActive('ArrowDown',0,5)).toBe(1);
    expect(moveSearchActive('ArrowDown',4,5)).toBe(4);
    expect(moveSearchActive('ArrowUp',0,5)).toBe(0);
    expect(moveSearchActive('ArrowUp',2,5)).toBe(1);
  });
  it.each<[Geo,string]>([['MX','liga-mx'],['CO','colombia-primera-a'],['PE','peru-liga-1'],['ROW','peru-liga-1']])('uses shared %s demand for equally relevant competitions', (geo,first)=>{
    const rows=[row('competition','Liga MX','liga-mx'),row('competition','Liga BetPlay','colombia-primera-a'),row('competition','Liga 1','peru-liga-1')];
    expect(rankSportsSearch(rows,'liga',geo)[0].slug).toBe(first);
    expect(rankSportsSearch([...rows].reverse(),'liga',geo)).toEqual(rankSportsSearch(rows,'liga',geo));
  });
  it.each(['team','player'] as const)('uses verified competition membership for %s discovery without exposing ranking inputs',kind=>{
    const rows=[
      {...row(kind,'Deportivo México'),competitionSlugs:['liga-mx']},
      {...row(kind,'Deportivo Colombia'),competitionSlugs:['colombia-primera-a']},
      {...row(kind,'Deportivo Perú'),competitionSlugs:['peru-liga-1']},
    ];
    for(const [geo,name] of [['MX','Deportivo México'],['CO','Deportivo Colombia'],['PE','Deportivo Perú']] as const){
      const results=rankSportsSearch(rows,'deportivo',geo);
      expect(results[0].name).toBe(name);
      expect(results.every(result=>!('competitionSlugs' in result))).toBe(true);
    }
    expect(rankSportsSearch(rows,'deportivo','ROW')[0].name).toBe('Deportivo Perú');
  });
  it('never lets GEO demand override an exact named match',()=>{
    const rows=[row('competition','Liga BetPlay','colombia-primera-a'),row('competition','Liga BetPlay internacional','champions-league')];
    expect(rankSportsSearch(rows,'liga betplay','MX')[0].slug).toBe('colombia-primera-a');
  });
});
