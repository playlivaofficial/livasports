import Link from '@/sports/SportsLink';
import {interfaceDictionary,matchPath,type InterfaceLocale} from '@/localization/interface';
import {competitionPath} from '@/sports/policy';
import type {NextMatchView} from '@/match-center/types';
import {LocalizedTimeText} from '@/localization/LocalizedTime';

/**
 * M1 — a finished match is a dead end for readers and crawlers alike: its own odds are gone and every
 * other link on the page points further into the past. This compact block sends both on to the nearest
 * upcoming inventory, preferring a fixture involving one of these two teams over another fixture in the
 * same competition. It reuses the existing read model and panel styling; it is navigation, not a feature.
 */
const copy={
  br:{heading:'Próximos jogos',team:'Time desta partida',competition:'Mesma competição'},
  mx:{heading:'Próximos partidos',team:'Equipo de este partido',competition:'Misma competición'},
  en:{heading:'Upcoming matches',team:'Team from this match',competition:'Same competition'},
} as const;

export function NextMatches({locale,matches,timeZone}:{locale:InterfaceLocale;matches:readonly NextMatchView[]|undefined;timeZone?:string}){
  if(!matches?.length)return null;
  const text=copy[locale],dictionary=interfaceDictionary(locale);
  const zone=timeZone??dictionary.timeZone;
  return <section id="next-matches" className="match-panel"><h2>{text.heading}</h2>
    <ul className="next-match-list">{matches.map(match=>
      <li key={match.publicId}>
        <Link href={matchPath(locale,match.publicId,match.home.name,match.away.name)}>{match.home.name} × {match.away.name}</Link>
        <small>
          <Link href={competitionPath(locale,match.competitionSlug)}>{match.competition}</Link>
          {' · '}<time dateTime={match.kickoff}><LocalizedTimeText value={match.kickoff} locale={locale} options={{dateStyle:'medium',timeStyle:'short'}} fallbackTimeZone={zone}/></time>
          {' · '}{match.relation==='TEAM'?text.team:text.competition}
        </small>
      </li>)}
    </ul>
  </section>;
}
