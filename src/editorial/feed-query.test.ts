import {describe,expect,it} from 'vitest';
import {newsFeedFilters,newsFeedSearch} from './feed-query';
import {translatedPath} from '@/localization/interface';

describe('editorial filters survive language changes without acting as GEO preferences',()=>{
 it('reads only bounded known sport/topic/news-region identities',()=>{
  expect(newsFeedFilters('?newsSport=basketball&newsTopic=nba&newsCountry=international')).toEqual({sport:'basketball',topic:'nba',country:'international'});
  expect(newsFeedFilters('?newsSport=cricket&newsTopic=unknown&newsCountry=BR')).toEqual({sport:'all',topic:'all',country:'all'});
  expect(newsFeedFilters('?newsSport=tennis&newsTopic=nba&newsCountry=co')).toEqual({sport:'tennis',topic:'all',country:'co'});
  expect(newsFeedFilters('?geo=MX&country=MX&locale=mx&commercialGeo=MX')).toEqual({sport:'all',topic:'all',country:'all'});
 });
 it('preserves unrelated page context while changing only the three editorial parameters',()=>{
  const query=newsFeedSearch('?view=list&season=2026&newsCountry=mx',{sport:'basketball',topic:'nba',country:'international'});
  expect(new URLSearchParams(query).get('view')).toBe('list');expect(new URLSearchParams(query).get('season')).toBe('2026');
  const target=translatedPath('/en/news'+query+'#news-feed-heading','br');
  expect(target).toBe('/br/noticias'+query+'#news-feed-heading');expect(newsFeedFilters(new URL('https://livasports.com'+target).search)).toEqual({sport:'basketball',topic:'nba',country:'international'});
 });
 it('allows all sports to override a sport-page default and removes cleared topic/region filters',()=>{
  const query=newsFeedSearch('?newsSport=basketball&newsTopic=nba&newsCountry=co',{sport:'all',topic:'all',country:'all'});
  expect(query).toBe('?newsSport=all');expect(newsFeedFilters(query,'basketball')).toEqual({sport:'all',topic:'all',country:'all'});
  expect(newsFeedFilters('','tennis').sport).toBe('tennis');
 });
});
