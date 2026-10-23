import type {InterfaceLocale} from '@/localization/interface';
import {publishedSnapshots} from './server';
import {snapshotFreshness,type SportsSnapshot} from './model';
import {StandingsWorkbench} from './StandingsWorkbench';
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
 const snapshots=highlightSnapshots(await publishedSnapshots());
 if(!snapshots.length)return null;
 return <StandingsWorkbench snapshots={snapshots} locale={locale}/>;
}
