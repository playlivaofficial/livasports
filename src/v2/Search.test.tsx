import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,expect,it,vi} from 'vitest';
import {interfaceLocales,type InterfaceLocale} from '@/localization/interface';
import {competitions,competitionById,competitionPath} from '@/multisport/catalog';
import {EditorialSearch} from './Search';

const searchState=vi.hoisted(()=>({query:''}));
vi.mock('react',async importOriginal=>({
  ...await importOriginal<typeof import('react')>(),
  useState:()=>[searchState.query,vi.fn()],
}));

function search(query:string,locale:InterfaceLocale='mx'){
  searchState.query=query;
  return load(renderToStaticMarkup(<EditorialSearch locale={locale} initialTime="2026-10-19T12:00:00.000Z"/>));
}

describe('catalog-backed public competition search',()=>{
  it.each(interfaceLocales)('finds real competition abbreviations in the %s interface',locale=>{
    for(const id of ['nba','nfl','mlb','nhl','ufc']){
      const $=search(`  ${id.toUpperCase()}  `,locale),competition=competitionById(id)!;
      const result=$(`.v2-search-results a[href="${competitionPath(locale,id)}"]`);
      expect(result).toHaveLength(1);
      expect(result.find('strong').text()).toBe(competition.officialName);
    }
    for(const acronym of ['ATP','WTA']){
      const $=search(acronym,locale);
      for(const competition of competitions.filter(item=>item.id.startsWith(acronym.toLowerCase()+'-'))){
        expect($(`.v2-search-results a[href="${competitionPath(locale,competition.id)}"]`)).toHaveLength(1);
      }
    }
  });

  it('matches every actual catalog ID without adding invented competition entries',()=>{
    for(const competition of competitions){
      const $=search(competition.id);
      expect($(`.v2-search-results a[href="${competitionPath('mx',competition.id)}"]`)).toHaveLength(1);
    }
  });

  it('accepts spaced IDs while preserving full-name and accent-insensitive searches',()=>{
    expect(search('atp masters 1000')(`a[href="${competitionPath('mx','atp-masters-1000')}"]`)).toHaveLength(1);
    expect(search('National Basketball Association')(`a[href="${competitionPath('mx','nba')}"]`)).toHaveLength(1);
    expect(search('beisbol')(`a[href="${competitionPath('mx','mlb')}"]`)).toHaveLength(1);
  });

  it('keeps unknown abbreviations empty and does not expose provenance URLs as search terms',()=>{
    expect(search('ZZZ-UNLISTED-LEAGUE')('.v2-search-results a')).toHaveLength(0);
    expect(search('raw.githubusercontent.com')('.v2-search-results a')).toHaveLength(0);
  });
});
