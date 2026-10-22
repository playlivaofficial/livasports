import Link from 'next/link';
import {IdentityLogo} from './IdentityLogo';
import type {InterfaceLocale} from '@/localization/interface';
import {publicLanguage} from '@/localization/interface';
import type {SportsSnapshot,SportsEvent} from './model';
import {competitionById,competitionPath,snapshotEntityPath} from './catalog';
import {sportsCopy} from './copy';

/** Only source-backed participant IDs; no guessed opponents, remote badges or inferred scores. */
export function MatchupCard({snapshot,event,locale}:{snapshot:SportsSnapshot;event:SportsEvent;locale:InterfaceLocale}){
 const home=snapshot.entities.find(entity=>entity.id===event.homeId),away=snapshot.entities.find(entity=>entity.id===event.awayId),competition=competitionById(snapshot.competitionId);
 if(!home||!away||home.id===away.id||!competition)return null;
 const language=publicLanguage(locale),c=sportsCopy(locale),score=event.status==='completed'?event.scores:null;
 const label={en:'Match details',es:'Detalles del encuentro',pt:'Detalhes do confronto'}[language];
 return <section className="ms-matchup-card" aria-label={label}>
  <div className="ms-matchup-meta"><Link href={competitionPath(locale,competition.id)}>{competition.officialName} ↗</Link><span>{snapshot.season}</span></div>
  <div className="ms-matchup-pair"><Link href={snapshotEntityPath(locale,snapshot,home.id)}><IdentityLogo competitionId={snapshot.competitionId} teamName={home.name}/>{home.name}</Link><div className="ms-matchup-result">{score?<strong>{score.home}<span aria-hidden="true"> – </span>{score.away}</strong>:<span aria-hidden="true">VS</span>}<small>{c[event.status]}</small></div><Link href={snapshotEntityPath(locale,snapshot,away.id)}><IdentityLogo competitionId={snapshot.competitionId} teamName={away.name}/>{away.name}</Link></div>
  <div className="ms-matchup-foot"><span>{event.round??event.stage}</span><span>{snapshot.sourceId} · <time dateTime={snapshot.observedAt}>{snapshot.observedAt.slice(0,10)}</time></span></div>
 </section>;
}
