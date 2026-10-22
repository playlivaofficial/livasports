import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {publishedSnapshots} from './server';
import {localDataPreviewEnabled} from './local-preview';
import {competitionById,competitionPath,sportsPath} from './catalog';
import {sportsCopy} from './copy';
import {StandingsTable,SnapshotSource} from './components';
import {snapshotFreshness,type SportsSnapshot} from './model';
import {LeaguePulse} from './LeaguePulse';
/** A dated recent publication remains useful between rounds, never relabelled as live/current. */
export function highlightSnapshots(items:SportsSnapshot[],now=new Date()):SportsSnapshot[]{
 const seen=new Set<string>();
 return items.filter(item=>{
  const freshness=snapshotFreshness(item,now);
  return item.tables.some(table=>table.rows.length)&&['fresh','stale'].includes(freshness.status)&&freshness.ageHours!==null&&freshness.ageHours<=7*24;
 }).sort((a,b)=>b.observedAt.localeCompare(a.observedAt)).filter(item=>{
  if(seen.has(item.competitionId))return false;
  seen.add(item.competitionId);return true;
 }).slice(0,2);
}
export async function StandingsHighlights({locale}:{locale:InterfaceLocale}){
 const c=sportsCopy(locale),snapshots=highlightSnapshots(await publishedSnapshots());
 if(!snapshots.length)return null;
 return <section className="v2-section" id="standings"><div className="v2-section-heading"><h2>{c.standings}</h2><Link href={sportsPath(locale)}>{c.competitions} ↗</Link></div><div className="ms-highlights">{snapshots.map(snapshot=><div key={snapshot.competitionId} className="lp-home-league"><article className="ms-highlight"><h3><Link href={competitionPath(locale,snapshot.competitionId)}>{competitionById(snapshot.competitionId)?.officialName} <span>{snapshot.season} ↗</span></Link></h3><StandingsTable table={snapshot.tables.find(table=>table.rows.length)!} snapshot={snapshot} locale={locale} limit={5} compact/><details className="ms-highlight-source"><summary>{c.source} · {c.licence}</summary><SnapshotSource snapshot={snapshot} locale={locale} downloadable={!localDataPreviewEnabled()}/></details></article><LeaguePulse snapshot={snapshot} locale={locale} compact/></div>)}</div></section>;
}
