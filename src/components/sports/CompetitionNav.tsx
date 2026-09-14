import Link from '@/sports/SportsLink';
import type {InterfaceLocale} from '@/localization/interface';
import {competitionPath} from '@/sports/policy';
import {countryMarkForSlug} from '@/sports/country-mark';

export interface CompetitionNavItem {
  slug:string;
  name:string;
  group:string;
  count:number;
}

const groupCopy={
  br:{BRAZIL:'Brasil',AMERICAS:'Américas',EUROPE:'Europa',OTHER:'Outros'},
  mx:{BRAZIL:'Brasil',AMERICAS:'Américas',EUROPE:'Europa',OTHER:'Otros'},
  en:{BRAZIL:'Brazil',AMERICAS:'Americas',EUROPE:'Europe',OTHER:'Other'},
} as const;

export function CompetitionNavRow({locale,item,active,allHref,allLabel}:{locale:InterfaceLocale;item?:CompetitionNavItem;active:boolean;allHref?:string;allLabel?:string}){
  if(!item)return <Link href={allHref!} aria-current={active?'page':undefined} className="competition-nav-row">{allLabel}</Link>;
  const mark=countryMarkForSlug(item.slug);
  return <Link href={competitionPath(locale,item.slug)} aria-current={active?'page':undefined} aria-label={item.count>0?`${item.name}, ${item.count}`:item.name} className="competition-nav-row">
    <span className="competition-nav-main">
      <span className="competition-nav-flag" aria-hidden="true" title={mark.label}>{mark.emoji}</span>
      <span className="competition-nav-name">{item.name}</span>
    </span>
    {item.count>0?<span className="competition-nav-count">{item.count}</span>:null}
  </Link>;
}

export function CompetitionNav({locale,items,activeSlug,allHref,allLabel,title}:{locale:InterfaceLocale;items:readonly CompetitionNavItem[];activeSlug?:string;allHref:string;allLabel:string;title:string}){
  const labels=groupCopy[locale];
  return <nav className="board-competitions competition-nav" aria-label={title}>
    <input id="competition-nav-toggle" type="checkbox" className="competition-nav-toggle"/>
    <label htmlFor="competition-nav-toggle" className="competition-nav-control">{title}</label>
    <div className="competition-nav-panel">
      <h2>{title}</h2>
      <CompetitionNavRow locale={locale} active={!activeSlug} allHref={allHref} allLabel={allLabel}/>
      {Object.entries(labels).map(([group,label])=>{
        const rows=items.filter(item=>item.group===group);
        return rows.length?<div key={group}><h3>{label}</h3>{rows.map(item=><CompetitionNavRow key={item.slug} locale={locale} item={item} active={activeSlug===item.slug}/>)}</div>:null;
      })}
    </div>
  </nav>;
}
