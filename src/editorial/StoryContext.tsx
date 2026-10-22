import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import type {SportsSnapshot} from '@/multisport/model';
import {competitionPath,snapshotEntityPath,competitionById} from '@/multisport/catalog';
import {tr,translated} from '@/multisport/translation';
import type {PublishedNews} from './model';
import {storyContext} from './context';
export function StoryContext({story,snapshots,locale}:{story:PublishedNews;snapshots:SportsSnapshot[];locale:InterfaceLocale}){
  const context=storyContext(story,snapshots),competition=competitionById(story.competition);
  // The header already links the competition. Do not repeat an empty identity panel.
  if(!competition||!context)return null;
  const label=(en:string,es:string,pt:string)=>translated(tr(en,es,pt),locale);
  return <aside className="ed-sports-context" aria-label={label('Sports context','Contexto deportivo','Contexto esportivo')}><Link className="ed-kicker" href={competitionPath(locale,competition.id)}>{competition.officialName} ↗</Link>{context?<>{context.entities.length>0?<div className="ed-match-identities">{(context.event?[context.snapshot.entities.find(e=>e.id===context.event!.homeId)!,context.snapshot.entities.find(e=>e.id===context.event!.awayId)!]:context.entities.slice(0,4)).map(entity=><Link key={entity.id} href={snapshotEntityPath(locale,context.snapshot,entity.id)}><span className="ed-text-identity" aria-hidden="true">{entity.name.split(/\s+/).filter(s=>/\p{L}/u.test(s)).slice(0,2).map(s=>s[0]).join('')}</span><strong>{entity.name}</strong></Link>)}</div>:null}{context.event?<p><time dateTime={context.event.start??context.event.date??''}>{(context.event.start??context.event.date)?.slice(0,10)}</time>{context.event.status==='completed'&&context.event.scores?` · ${context.event.scores.home}–${context.event.scores.away}`:''}</p>:null}<Link className="v2-text-link" href={competitionPath(locale,competition.id)+'#standings'}>{label('View sourced records','Ver registros con fuentes','Ver registros com fontes')} →</Link><small>{label('Data cutoff','Fecha de los datos','Data de referência')}: {context.snapshot.observedAt.slice(0,10)} · {context.snapshot.sourceId}</small></>:null}</aside>;
}
