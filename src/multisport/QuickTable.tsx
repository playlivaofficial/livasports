import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {publicLanguage} from '@/localization/interface';
import {competitionById,competitionPath,snapshotEntityPath} from './catalog';
import {IdentityLogo} from './IdentityLogo';
import type {SportsSnapshot} from './model';
import {snapshotFreshness} from './model';
/** Compact doorway to a published table; never a claim of live scores. */
export function QuickTable({snapshot,locale}:{snapshot:SportsSnapshot;locale:InterfaceLocale}){
 const table=snapshot.tables.find(t=>t.type==='football'&&t.rows.length),competition=competitionById(snapshot.competitionId);
 if(!table||table.type!=='football'||!competition)return null;
 const lang=publicLanguage(locale),t=(en:string,es:string,pt:string)=>({en,es,pt})[lang];
 const fresh=snapshotFreshness(snapshot).status==='fresh';
 return <aside className="sp-quick-table" aria-label={t('Standings spotlight','Clasificación destacada','Classificação em destaque')}>
  <header><div><span className="sp-kicker">{t('The table','La clasificación','A classificação')}</span><h2><Link href={competitionPath(locale,snapshot.competitionId)}><IdentityLogo competitionId={snapshot.competitionId}/>{competition.officialName}<span aria-hidden="true">↗</span></Link></h2></div><span className="sp-season">{snapshot.season}</span></header>
  <p className="sp-table-date">{fresh?t('Data through','Datos hasta','Dados até'):t('Dated snapshot · not live','Registro fechado · no en vivo','Registro datado · não ao vivo')} <time dateTime={snapshot.observedAt}>{snapshot.observedAt.slice(0,10)}</time></p>
  <div className="sp-table-label"><span>{t('Club','Club','Clube')}</span><span>{t('Played / Pts','PJ / Pts','J / Pts')}</span></div>
  <ol>{table.rows.slice(0,3).map(row=>{const entity=snapshot.entities.find(e=>e.id===row.entityId);return entity?<li key={entity.id}><Link href={snapshotEntityPath(locale,snapshot,entity.id)}><span className="sp-rank">{row.rank}</span><IdentityLogo competitionId={snapshot.competitionId} teamName={entity.name}/><strong>{entity.name}</strong><span className="sp-played">{row.played}</span><b>{row.points}</b></Link></li>:null;})}</ol>
  <Link className="sp-table-more" href={competitionPath(locale,snapshot.competitionId)}>{t('Full standings & results','Clasificación y resultados','Classificação e resultados')} <span aria-hidden="true">→</span></Link>
 </aside>;
}
