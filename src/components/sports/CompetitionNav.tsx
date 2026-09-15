import Link from '@/sports/SportsLink';
import type {InterfaceLocale} from '@/localization/interface';
import {competitionPath} from '@/sports/policy';
import {competitionMark} from '@/sports/country-mark';
import {CountryMarkIcon} from './CountryMarkIcon';
import type {CompetitionNavItem} from '@/sports/types';
import {targetBySlug} from '@/config/footballCompetitions';

export type {CompetitionNavItem};

const sectionOrder=['BR','GB-ENG','ES','IT','DE','FR','PT','NL','TR','AR','MX','US','SA','INT-EUROPE','INT-SOUTH_AMERICA','INT-NORTH_AMERICA','INT-GLOBAL','OTHER'] as const;
type SectionKey=typeof sectionOrder[number];
const sectionCopy:Record<InterfaceLocale,Record<SectionKey,string>>={
  br:{BR:'Brasil','GB-ENG':'Inglaterra',ES:'Espanha',IT:'Itália',DE:'Alemanha',FR:'França',PT:'Portugal',NL:'Países Baixos',TR:'Turquia',AR:'Argentina',MX:'México',US:'Estados Unidos',SA:'Arábia Saudita','INT-EUROPE':'UEFA / Internacional','INT-SOUTH_AMERICA':'América do Sul','INT-NORTH_AMERICA':'América do Norte e Central','INT-GLOBAL':'Internacional',OTHER:'Outros'},
  mx:{BR:'Brasil','GB-ENG':'Inglaterra',ES:'España',IT:'Italia',DE:'Alemania',FR:'Francia',PT:'Portugal',NL:'Países Bajos',TR:'Turquía',AR:'Argentina',MX:'México',US:'Estados Unidos',SA:'Arabia Saudita','INT-EUROPE':'UEFA / Internacional','INT-SOUTH_AMERICA':'Sudamérica','INT-NORTH_AMERICA':'Norte y Centroamérica','INT-GLOBAL':'Internacional',OTHER:'Otros'},
  en:{BR:'Brazil','GB-ENG':'England',ES:'Spain',IT:'Italy',DE:'Germany',FR:'France',PT:'Portugal',NL:'Netherlands',TR:'Türkiye',AR:'Argentina',MX:'Mexico',US:'USA',SA:'Saudi Arabia','INT-EUROPE':'UEFA / International','INT-SOUTH_AMERICA':'South America','INT-NORTH_AMERICA':'North & Central America','INT-GLOBAL':'International',OTHER:'Other'},
};

function sectionKey(item:CompetitionNavItem):SectionKey {
  const target=targetBySlug(item.slug),country=target?target.countryCode:item.countryCode;
  if(country)return country==='GB'&&(target?.countryNames.includes('England')||item.countryName==='England')?'GB-ENG':sectionOrder.includes(country as SectionKey)?country as SectionKey:'OTHER';
  const region=target?.region??item.region;
  if(region==='EUROPE')return 'INT-EUROPE';
  if(region==='SOUTH_AMERICA')return 'INT-SOUTH_AMERICA';
  if(region==='NORTH_AMERICA')return 'INT-NORTH_AMERICA';
  if(region==='GLOBAL')return 'INT-GLOBAL';
  return 'OTHER';
}

export function competitionNavSections(locale:InterfaceLocale,items:readonly CompetitionNavItem[]){
  return sectionOrder.map(key=>({key,label:sectionCopy[locale][key],items:items.filter(item=>sectionKey(item)===key)})).filter(section=>section.items.length);
}

export function CompetitionNavRow({locale,item,active,allHref,allLabel}:{locale:InterfaceLocale;item?:CompetitionNavItem;active:boolean;allHref?:string;allLabel?:string}){
  if(!item)return <Link href={allHref!} aria-current={active?'page':undefined} className="competition-nav-row">{allLabel}</Link>;
  const mark=competitionMark(item);
  return <Link href={competitionPath(locale,item.slug)} aria-current={active?'page':undefined} aria-label={item.count>0?`${item.name}, ${item.count}`:item.name} className="competition-nav-row">
    <span className="competition-nav-main">
      <CountryMarkIcon mark={mark}/>
      <span className="competition-nav-name">{item.name}</span>
    </span>
    {item.count>0?<span className="competition-nav-count">{item.count}</span>:null}
  </Link>;
}

export function CompetitionNav({locale,items,activeSlug,allHref,allLabel,title}:{locale:InterfaceLocale;items:readonly CompetitionNavItem[];activeSlug?:string;allHref:string;allLabel:string;title:string}){
  return <nav className="board-competitions competition-nav" aria-label={title}>
    <input id="competition-nav-toggle" type="checkbox" className="competition-nav-toggle"/>
    <label htmlFor="competition-nav-toggle" className="competition-nav-control" aria-controls="competition-nav-panel">{title}</label>
    <div id="competition-nav-panel" className="competition-nav-panel">
      <h2>{title}</h2>
      <CompetitionNavRow locale={locale} active={!activeSlug} allHref={allHref} allLabel={allLabel}/>
      {competitionNavSections(locale,items).map(section=><div key={section.key} data-competition-country={section.key}><h3>{section.label}</h3>{section.items.map(item=><CompetitionNavRow key={item.slug} locale={locale} item={item} active={activeSlug===item.slug}/>)}</div>)}
    </div>
  </nav>;
}
