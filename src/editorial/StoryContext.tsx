import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import type {SportsSnapshot} from '@/multisport/model';
import {competitionPath,snapshotEntityPath,competitionById} from '@/multisport/catalog';
import {tr,translated} from '@/multisport/translation';
import type {PublishedNews} from './model';
import {storyContext} from './context';
import {MatchupCard} from '@/multisport/MatchupCard';
import {IdentityLogo} from '@/multisport/IdentityLogo';
export function domesticLeagueContext(story:PublishedNews,snapshots:SportsSnapshot[]){
 if(story.competition!=='copa-colombia'||story.country!=='co'||!story.title.en.includes('América de Cali'))return null;
 const snapshot=snapshots.find(s=>s.competitionId==='colombia-primera-a'&&s.sport==='football');
 const entity=snapshot?.entities.find(e=>e.name==='América de Cali');
 const table=snapshot?.tables.find(t=>t.type==='football');
 const row=table?.type==='football'?table.rows.find(r=>r.entityId===entity?.id):null;
 return snapshot&&entity&&row?{snapshot,entity,row}:null;
}
export function StoryContext({story,snapshots,locale}:{story:PublishedNews;snapshots:SportsSnapshot[];locale:InterfaceLocale}){
  const domestic=domesticLeagueContext(story,snapshots),label=(en:string,es:string,pt:string)=>translated(tr(en,es,pt),locale);
  if(domestic)return <aside className="sw-club-context"><div><IdentityLogo competitionId="colombia-primera-a" teamName={domestic.entity.name}/><div><span className="sp-kicker">{label('Club context · domestic league','Contexto del club · liga nacional','Contexto do clube · liga nacional')}</span><h2><Link href={snapshotEntityPath(locale,domestic.snapshot,domestic.entity.id)}>{domestic.entity.name} ↗</Link></h2></div></div><p>{label('Primera A standings, separate from the cup reported above.','Clasificación de Primera A, distinta de la copa de esta noticia.','Classificação da Primera A, separada da copa desta notícia.')}</p><dl><div><dt>{label('Position','Posición','Posição')}</dt><dd>{domestic.row.rank}</dd></div><div><dt>{label('Played','Jugados','Jogos')}</dt><dd>{domestic.row.played}</dd></div><div><dt>{label('Points','Puntos','Pontos')}</dt><dd>{domestic.row.points}</dd></div></dl><Link className="sp-table-more" href={competitionPath(locale,domestic.snapshot.competitionId)}>{label('Dated league table','Clasificación fechada','Classificação datada')} · {domestic.snapshot.observedAt} →</Link></aside>;
  const context=storyContext(story,snapshots),competition=competitionById(story.competition);
  // The header already links the competition. Do not repeat an empty identity panel.
  if(!competition||!context)return null;
  if(context.event)return <MatchupCard snapshot={context.snapshot} event={context.event} locale={locale}/>;
  return <aside className={`ed-sports-context${context.entities.length===1?' ed-single-identity':''}`} aria-label={label('Sports context','Contexto deportivo','Contexto esportivo')}>
    <Link className="ed-kicker" href={competitionPath(locale,competition.id)}>{competition.officialName} ↗</Link>
    {context.entities.length>0?<div className="ed-match-identities">{context.entities.slice(0,4).map(entity=><Link key={entity.id} href={snapshotEntityPath(locale,context.snapshot,entity.id)}><strong>{entity.name}</strong></Link>)}</div>:null}
    <Link className="v2-text-link" href={competitionPath(locale,competition.id)+'#standings'}>{label('View sourced records','Ver registros con fuentes','Ver registros com fontes')} →</Link>
    <small>{context.snapshot.observationBasis==='source-revision'?label('Source revision; results cutoff unconfirmed','Revisión de fuente; corte de resultados sin confirmar','Revisão da fonte; corte dos resultados não confirmado'):label('Data cutoff','Fecha de los datos','Data de referência')}: {context.snapshot.observedAt.slice(0,10)} · {context.snapshot.sourceId}</small>
  </aside>;
}
