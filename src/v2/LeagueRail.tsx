'use client';
import Link from 'next/link';
import {IdentityLogo} from '@/multisport/IdentityLogo';
import {identityAsset} from '@/multisport/identity-assets';
import {SportGlyph} from '@/multisport/SportGlyph';
import type {InterfaceLocale} from '@/localization/interface';
import {competitionPath,competitionById,sportName,type CatalogSport} from '@/multisport/catalog';
import {publicLanguage} from '@/localization/interface';

// Plain labels unless the asset-specific provenance registry contains a reviewed identity.
const railIdentity=[
  {id:'liga-mx',name:'Liga MX',region:['Mexico','México','México']},
  {id:'colombia-primera-a',name:'Liga BetPlay',region:['Colombia','Colombia','Colômbia']},
  {id:'peru-liga-1',name:'Liga 1',region:['Peru','Perú','Peru']},
  {id:'champions-league',name:'Champions League',region:['Europe','Europa','Europa']},
  {id:'bundesliga',name:'Bundesliga',region:['Germany','Alemania','Alemanha']},
  {id:'nba',name:'NBA',region:['North America','Norteamérica','América do Norte']},
  {id:'euroleague',name:'EuroLeague',region:['Europe / West Asia','Europa / Asia Occidental','Europa / Ásia Ocidental']},
  {id:'mlb',name:'MLB',region:['North America','Norteamérica','América do Norte']},
  {id:'nfl',name:'NFL',region:['United States','Estados Unidos','Estados Unidos']},
  {id:'nhl',name:'NHL',region:['North America','Norteamérica','América do Norte']},
  {id:'ufc',name:'UFC',region:['Global','Global','Global']},
  {id:'atp-rankings',name:'ATP',region:['World rankings','Ranking mundial','Ranking mundial']},
  {id:'wta-rankings',name:'WTA',region:['World rankings','Ranking mundial','Ranking mundial']},
];
export function LeagueRail({locale}:{locale:InterfaceLocale}){
  const languageIndex=['en','es','pt'].indexOf(publicLanguage(locale));
  return <div className="v2-league-rail">{railIdentity.map(({id,name,region})=>{const competition=competitionById(id)!;return <Link className="v2-league-tile ms-league-tile" data-sport={competition.sport} title={competition.officialName} key={id} href={competitionPath(locale,id)}><span className="ms-league-sport">{sportName(competition.sport as CatalogSport,locale)}</span>{identityAsset(id)?<IdentityLogo competitionId={id}/>:<span className="v3-identity-pending" title="Sport navigation symbol — official identity pending rights review"><SportGlyph sport={competition.sport as CatalogSport}/></span>}<strong>{name}</strong><span>{region[languageIndex]}</span></Link>;})}</div>;
}
