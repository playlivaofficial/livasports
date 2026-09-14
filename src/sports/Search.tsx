import {SportsSearchBox} from './SportsSearchBox';
import type {InterfaceLocale} from '@/localization/interface';
import {sportsCopy} from './copy';
import {sportsQuery} from './policy';

export function SportsSearch({locale,query}:{locale:InterfaceLocale;query:unknown}){
  const t=sportsCopy[locale],q=sportsQuery(query);
  return <section className="sports-search" id="sports-search" aria-label={t.search}>
    <SportsSearchBox locale={locale} query={q}/>
  </section>;
}
