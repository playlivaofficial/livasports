'use client';
import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {leagues,leagueCountry} from './leagues';
import {useEditorialEdition} from './Header';
import {v2Path} from './routes';
export function LeagueRail({locale}:{locale:InterfaceLocale}){
  const edition=useEditorialEdition(locale),first=edition==='co'?'colombia-primera-a':edition==='pe'?'peru-liga-1':'liga-mx';
  const ordered=[...leagues].sort((a,b)=>a.id===first?-1:b.id===first?1:0);
  return <div className="v2-league-rail">{ordered.map(league=><Link className="v2-league-tile" key={league.id} href={v2Path(locale,'leagues',league.id)}><strong className="ed-league-wordmark" data-league={league.id}>{league.name}</strong><span>{leagueCountry(league,locale)}</span></Link>)}</div>;
}
