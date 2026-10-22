import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {publicLanguage} from '@/localization/interface';
import {competitionById,competitionPath,snapshotEntityPath} from './catalog';
import {snapshotFreshness,type SportsSnapshot} from './model';
import {IdentityLogo} from './IdentityLogo';

/** Only completed, scored events before the published cutoff; never a live feed. */
export function leaguePulse(snapshot:SportsSnapshot){
 const cutoff=Date.parse(snapshot.observedAt),ids=new Set(snapshot.entities.map(item=>item.id));
 if(snapshot.sport!=='football'||!Number.isFinite(cutoff))return null;
 const completed=snapshot.events.filter(event=>event.status==='completed'&&event.scores&&event.homeId!==event.awayId&&ids.has(event.homeId)&&ids.has(event.awayId)&&event.start&&Date.parse(event.start)<=cutoff)
  .sort((a,b)=>b.start!.localeCompare(a.start!)||a.id.localeCompare(b.id));
 if(!completed.length)return null;
 return {completed:completed.length,goals:completed.reduce((sum,event)=>sum+event.scores!.home+event.scores!.away,0),recent:completed.slice(0,3)};
}
export function LeaguePulse({snapshot,locale,compact=false}:{snapshot:SportsSnapshot;locale:InterfaceLocale;compact?:boolean}){
 const pulse=leaguePulse(snapshot),competition=competitionById(snapshot.competitionId);if(!pulse||!competition)return null;
 const lang=publicLanguage(locale),t=(en:string,es:string,pt:string)=>({en,es,pt})[lang];
 const status=snapshotFreshness(snapshot).status;
 return <section className={`lp-pulse${compact?' lp-compact':''}`} aria-label={t('League notebook','Cuaderno de la liga','Panorama da liga')}>
  <header><IdentityLogo competitionId={snapshot.competitionId}/><div><span className="v2-eyebrow">{t('League notebook','Cuaderno de la liga','Panorama da liga')}</span><h2><Link href={competitionPath(locale,snapshot.competitionId)}>{competition.officialName} ↗</Link></h2></div></header>
  <p className="lp-cutoff">{status==='fresh'?t('Dated source','Fuente fechada','Fonte datada'):t('Older snapshot · not live','Registro anterior · no en vivo','Registro anterior · não ao vivo')} · <time dateTime={snapshot.observedAt}>{snapshot.observedAt.slice(0,10)}</time></p>
  <dl className="lp-stats"><div><dt>{t('Teams','Equipos','Equipes')}</dt><dd>{snapshot.entities.length}</dd></div><div><dt>{t('Completed matches','Partidos finalizados','Jogos encerrados')}</dt><dd>{pulse.completed}</dd></div><div><dt>{t('Recorded goals','Goles registrados','Gols registrados')}</dt><dd>{pulse.goals}</dd></div></dl>
  <h3>{t('Latest results in this snapshot','Últimos resultados del registro','Últimos resultados deste registro')}</h3>
  <div className="lp-results">{pulse.recent.map(event=>{const home=snapshot.entities.find(e=>e.id===event.homeId)!,away=snapshot.entities.find(e=>e.id===event.awayId)!;return <article key={event.id}><time dateTime={event.start!}>{event.start!.slice(5,10).replace('-','/')}</time><div>{[home,away].map((team,index)=><div className="lp-result-team" key={team.id}><Link href={snapshotEntityPath(locale,snapshot,team.id)}><IdentityLogo competitionId={snapshot.competitionId} teamName={team.name}/><span>{team.name}</span></Link><strong>{index===0?event.scores!.home:event.scores!.away}</strong></div>)}</div></article>;})}</div>
  <footer><span>{snapshot.sourceId} · {snapshot.season}</span><Link href={competitionPath(locale,snapshot.competitionId)+'#source'}>{t('Source & methodology','Fuente y metodología','Fonte e metodologia')} ↗</Link></footer>
 </section>;
}
