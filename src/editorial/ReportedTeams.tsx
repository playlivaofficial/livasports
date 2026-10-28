import Link from 'next/link';
import {nbaDivisions} from '@/multisport/basketball-model';
import {IdentityLogo} from '@/multisport/IdentityLogo';
import {competitionPath} from '@/multisport/catalog';
import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import type {PublishedNews} from './model';
/** These are exact mentions in approved reporting, not inferred opponents, standings or results. */
export function reportedNbaTeams(item:PublishedNews){
 if(item.sport!=='basketball'||item.competition!=='nba')return [];
 return Object.values(nbaDivisions).flat().filter(name=>new RegExp('(?<![\\p{L}\\p{N}])'+name+'(?![\\p{L}\\p{N}])','u').test(item.body.en));
}
export function ReportedTeams({item,locale}:{item:PublishedNews;locale:InterfaceLocale}){
 const teams=reportedNbaTeams(item);if(!teams.length)return null;
 const lang=publicLanguage(locale),heading={en:'Teams in this report',es:'Equipos en esta noticia',pt:'Equipes nesta notícia'}[lang],link={en:'Explore the NBA',es:'Explorar la NBA',pt:'Explorar a NBA'}[lang];
 return <section className="ed-reported-teams" aria-label={heading}><header><h2>{heading}</h2><Link prefetch={false} href={competitionPath(locale,'nba')+'#competitors'}>{link} ↗</Link></header><ul>{teams.map(name=><li key={name}><IdentityLogo competitionId="nba" teamName={name}/><strong>{name}</strong></li>)}</ul></section>;
}
