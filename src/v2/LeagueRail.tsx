'use client';
import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {competitionPath,competitionById,sportName,type CatalogSport} from '@/multisport/catalog';
export function LeagueRail({locale}:{locale:InterfaceLocale}){
  const ids=['liga-mx','colombia-primera-a','peru-liga-1','champions-league','nba','euroleague','mlb','nfl','nhl','ufc','atp-rankings','wta-rankings'];
  return <div className="v2-league-rail">{ids.map(id=>{const competition=competitionById(id)!;return <Link className="v2-league-tile ms-league-tile" key={id} href={competitionPath(locale,id)}><span className="ms-league-sport">{sportName(competition.sport as CatalogSport,locale)}</span><strong>{competition.officialName}</strong><span>{competition.region}</span></Link>;})}</div>;
}
