import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {sportsPath,sportIds,sportName} from '@/multisport/catalog';
import {SportGlyph} from '@/multisport/SportGlyph';
export function HomeSportsNav({locale}:{locale:InterfaceLocale}){
 return <nav className="v3-sports-selector" aria-label={locale==='en'?'Explore seven sports':locale==='br'?'Explore sete esportes':'Explora siete deportes'}>{sportIds.map(sport=><Link key={sport} href={sportsPath(locale,sport)}><SportGlyph sport={sport}/><span>{sportName(sport,locale)}</span></Link>)}</nav>;
}
