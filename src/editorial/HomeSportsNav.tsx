import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {sportsPath,sportIds,sportName} from '@/multisport/catalog';
import {SportGlyph} from '@/multisport/SportGlyph';
export function HomeSportsNav({locale}:{locale:InterfaceLocale}){
 const label=locale==='en'?'All 7 sports':locale==='br'?'7 esportes':'7 deportes';
 return <div className="sw-sport-navigation"><nav className="v3-sports-selector" aria-label={label}>{sportIds.map(sport=><Link key={sport} href={sportsPath(locale,sport)}><SportGlyph sport={sport}/><span>{sportName(sport,locale)}</span></Link>)}</nav><details className="sw-all-sports"><summary>{label} <span aria-hidden="true">⌄</span></summary><div>{sportIds.map((sport,index)=><Link key={sport} href={sportsPath(locale,sport)} data-sport={sport}><span className="sw-sport-number">0{index+1}</span><SportGlyph sport={sport}/><strong>{sportName(sport,locale)}</strong><span aria-hidden="true">↗</span></Link>)}</div></details></div>;
}
