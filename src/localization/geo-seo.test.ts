import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {CORE_GEOS,geoProfile} from '@/config/geo';
import {getDictionary} from '@/config/i18n';
import {routeMetadata} from '@/config/metadata';
import {defaultLanguage,interfaceLocales,interfaceRoutes,languageTags,matchPath,teamPath,playerPath,translatedPath} from './interface';
import {competitionPath} from '@/sports/policy';
import {helpKinds,helpPath} from './help-routes';
import {localeOfPage} from '@/seo/intelligence';

describe('canonical MX / CO / PE locale contract',()=>{
  it('gives each regional football/live hub its own factual country intent',()=>{
    for(const page of ['home','football','live'] as const){
      const titles=CORE_GEOS.map(geo=>getDictionary(geoProfile(geo).locale as 'mx'|'co'|'pe').pages[page].title);
      expect(new Set(titles).size).toBe(3);
      for(const geo of CORE_GEOS){const copy=getDictionary(geoProfile(geo).locale as 'mx'|'co'|'pe').pages[page];expect(copy.description).not.toMatch(/Brasileirão|Brasil|R\$/);}
    }
  });
  it.each(CORE_GEOS)('%s uses one canonical Spanish route family and actual local time zone',geo=>{
    const p=geoProfile(geo),locale=p.locale as 'mx'|'co'|'pe',dict=getDictionary(locale);
    expect(dict.locale).toBe(p.languageTag);expect(dict.countryCode).toBe(geo);expect(dict.timeZone).toBe(p.timeZone);
    expect(defaultLanguage(null,geo)).toBe(locale);
    for(const key of ['home','football','live','today'] as const){
      const metadata=routeMetadata(locale,key);expect(metadata.alternates?.canonical).toBe(interfaceRoutes[locale][key]);
      expect(metadata.other?.['content-language']).toBe(p.languageTag);
      expect(metadata.alternates?.languages?.[p.languageTag]).toBe(interfaceRoutes[locale][key]);
      expect(metadata.openGraph?.locale).toBe(p.languageTag.replace('-','_'));
    }
  });
  it('translates existing route identities reciprocally without creating es-* URLs',()=>{
    const id='0123456789abcdef';
    for(const source of interfaceLocales)for(const target of interfaceLocales){
      expect(translatedPath(matchPath(source,id,'América','Atlético Nacional'),target)).toBe(matchPath(target,id,'América','Atlético Nacional'));
      expect(translatedPath(teamPath(source,id,'Universitario de Deportes'),target)).toBe(teamPath(target,id,'Universitario de Deportes'));
      expect(translatedPath(playerPath(source,id,'Jugador'),target)).toBe(playerPath(target,id,'Jugador'));
      expect(translatedPath(competitionPath(source,'liga-mx',{tab:'standings'}),target)).toBe(competitionPath(target,'liga-mx',{tab:'standings'}));
      for(const kind of helpKinds)expect(translatedPath(helpPath(source,kind),target)).toBe(helpPath(target,kind));
    }
  });
  it('country evidence is not fabricated from a locale preference',()=>{
    expect(defaultLanguage('co','MX')).toBe('mx');expect(defaultLanguage(null,'US')).toBe('en');
    for(const locale of interfaceLocales)expect(localeOfPage('https://livasports.com'+interfaceRoutes[locale].home)).toBe(languageTags[locale]);
    expect(localeOfPage('https://livasports.com/es-co/partido/a')).toBe('other');
  });
});
