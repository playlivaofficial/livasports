'use client';
import {useState,useRef} from 'react';
import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {publicLanguage} from '@/localization/interface';
import type {SportsSnapshot} from './model';
import {competitionById,competitionPath} from './catalog';
import {StandingsTable,SnapshotSource} from './components';
import {IdentityLogo} from './IdentityLogo';
import {LeaguePulse} from './LeaguePulse';
export function StandingsWorkbench({snapshots,locale}:{snapshots:SportsSnapshot[];locale:InterfaceLocale}){
 // The first-fold doorway already previews the newest table. Open the other verified league here.
 const [selected,setSelected]=useState(snapshots.length>1?1:0),buttons=useRef<(HTMLButtonElement|null)[]>([]),snapshot=snapshots[selected]??snapshots[0];if(!snapshot)return null;
 const lang=publicLanguage(locale),t=(en:string,es:string,pt:string)=>({en,es,pt})[lang];
 return <section className="sw-workbench v2-section" id="standings"><header><div><span className="sp-kicker">{t('The standings room','La sala de clasificaciones','Central de classificações')}</span><h2>{t('Follow the competition','Sigue la competición','Acompanhe a competição')}</h2></div><span className="sw-count">{snapshots.length} {t('published tables','tablas publicadas','tabelas publicadas')}</span></header>
 <div className="sw-tabs" role="tablist" aria-label={t('Choose a league table','Elige una clasificación','Escolha uma classificação')}>{snapshots.map((s,i)=><button key={s.competitionId} ref={node=>{buttons.current[i]=node;}} role="tab" id={'sw-tab-'+i} aria-selected={selected===i} aria-controls="sw-panel" tabIndex={selected===i?0:-1} onClick={()=>setSelected(i)} onKeyDown={event=>{let next=i;if(event.key==='ArrowRight')next=(i+1)%snapshots.length;else if(event.key==='ArrowLeft')next=(i-1+snapshots.length)%snapshots.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=snapshots.length-1;else return;event.preventDefault();setSelected(next);buttons.current[next]?.focus();}}><IdentityLogo competitionId={s.competitionId}/><span>{competitionById(s.competitionId)?.officialName}</span></button>)}</div>
 <div id="sw-panel" role="tabpanel" aria-labelledby={'sw-tab-'+selected} tabIndex={0} className="sw-panel"><div><div className="sw-table-heading"><strong>{snapshot.stage}</strong><span>{snapshot.season}</span></div><StandingsTable table={snapshot.tables.find(table=>table.rows.length)!} snapshot={snapshot} locale={locale} limit={5} compact/><Link className="sp-table-more" href={competitionPath(locale,snapshot.competitionId)}>{t('Full table, teams & sources','Tabla completa, equipos y fuentes','Tabela completa, equipes e fontes')} →</Link><details className="sw-provenance"><summary>{t('Source & data licence','Fuente y licencia de datos','Fonte e licença dos dados')}</summary><SnapshotSource snapshot={snapshot} locale={locale} downloadable={false}/></details></div><LeaguePulse snapshot={snapshot} locale={locale} compact/></div></section>;
}
