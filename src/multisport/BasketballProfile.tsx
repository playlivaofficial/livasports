import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {publicLanguage} from '@/localization/interface';
import type {PublishedNews} from '@/editorial/model';
import {NewsCard} from '@/editorial/NewsCards';
import {competitionPath,snapshotSeasonToken,type Competition} from './catalog';
import {ExperienceIdentity} from './CompetitionExperience';
import {SnapshotSource,StandingsTable,EventsList} from './components';
import {nbaDivision} from './basketball-model';
import type {BasketballTable,SportsSnapshot,SportsEntity} from './model';
import {newsForEntity} from './experience-model';
import {sportsCopy} from './copy';
import {tableLabel} from './table-labels';
import {localDataPreviewEnabled} from './local-preview';
export function BasketballProfile({snapshot,competition,entity,locale,news}:{snapshot:SportsSnapshot;competition:Competition;entity:SportsEntity;locale:InterfaceLocale;news:PublishedNews[]}){
 const t=(en:string,es:string,pt:string)=>({en,es,pt})[publicLanguage(locale)],c=sportsCopy(locale);
 const table=snapshot.tables.find((item):item is BasketballTable=>item.type==='basketball'&&item.rows.some(r=>r.entityId===entity.id))!,row=table.rows.find(r=>r.entityId===entity.id)!;
 const stories=news.filter(item=>newsForEntity(item,snapshot,entity)),division=competition.id==='nba'?nbaDivision(entity.name):undefined;
 const stats=[[t('Wins','Victorias','Vitórias'),row.wins],[t('Losses','Derrotas','Derrotas'),row.losses],['PCT',(row.winPercentage*100).toFixed(1)+'%'],...(row.gamesBehind===undefined?[]:[[t('Games behind','Juegos de diferencia','Jogos atrás'),row.gamesBehind]])];
 return <div className={`cx-experience bk-experience bk-profile bk-${competition.id}`}><header className="bk-header"><div className="bk-court" aria-hidden="true"/><div className="bk-title"><ExperienceIdentity competitionId={competition.id} name={entity.name}/><Link href={competitionPath(locale,competition.id)}>{competition.officialName} ↗</Link><h1>{entity.name}</h1><p>{[snapshot.season,table.conference?tableLabel(table.conference,locale):null,division].filter(Boolean).join(' · ')}</p></div></header><dl className="cx-record">{stats.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="bk-dateline">{snapshot.observationBasis==='source-revision'?t('Source revision; results cutoff unconfirmed','Revisión de fuente; corte de resultados sin confirmar','Revisão da fonte; corte dos resultados não confirmado'):t('Dated record, not live','Registro fechado, no en vivo','Registro datado, não ao vivo')} · <time dateTime={snapshot.observedAt}>{snapshot.observedAt.slice(0,10)}</time></p><section className="cx-section"><div className="bk-section-heading"><span>{t('SEASON RECORD','REGISTRO DE TEMPORADA','REGISTRO DA TEMPORADA')}</span><h2>{t('Where the team stands','La posición del equipo','A posição da equipe')}</h2></div><StandingsTable table={{...table,rows:[row]}} snapshot={snapshot} locale={locale}/><Link className="cx-full-table" href={`${competitionPath(locale,competition.id)}/season/${snapshotSeasonToken(snapshot.season)}#standings`}>{c.standings} →</Link></section>{stories.length?<section className="cx-section"><h2>{c.related}</h2><div className="cx-news">{stories.map(item=><NewsCard key={item.slug} item={item} locale={locale}/>)}</div></section>:null}{snapshot.events.some(event=>event.homeId===entity.id||event.awayId===entity.id)?<section className="cx-section"><h2>{c.matches}</h2><EventsList snapshot={snapshot} locale={locale} entityId={entity.id}/></section>:<p className="bk-fineprint">{t('This published record does not contain a verified game schedule, roster or playoff assignment.','Este registro publicado no contiene calendario, plantilla ni asignación de playoffs verificados.','Este registro publicado não contém calendário, elenco ou posição nos playoffs verificados.')}</p>}<section id="source" className="cx-section"><SnapshotSource snapshot={snapshot} locale={locale} downloadable={!localDataPreviewEnabled()}/></section><p className="cx-asset-note">{c.noAffiliation}</p></div>;
}
