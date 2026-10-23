import {interfaceLocales,type InterfaceLocale} from '@/localization/interface';
import {siteOrigin} from '@/seo/policy';
import {competitionPath,snapshotEntityPath,snapshotSeasonToken} from './catalog';
import {validateSnapshot,type SportsEvent,type SportsSnapshot,type SportsTable} from './model';
import {orderSportsSnapshots} from './ordering';

export interface SportsSitemapCluster {
 paths:Record<InterfaceLocale,string>;
 /** Source observation precision is retained; retrieval/build time is never substituted. */
 lastmod:string;
}

const datedEvent=(event:SportsEvent)=>Boolean(event.start||event.date)&&['scheduled','live','completed'].includes(event.status);
function substantiveTable(table:SportsTable){
 return table.rows.length>=2&&(table.type==='tennis'||table.type==='mma'||table.rows.some(row=>'played' in row&&row.played>0));
}
function substantiveEntities(snapshot:SportsSnapshot):Set<string>{
 const ids=new Set<string>();
 for(const table of snapshot.tables){
  if(!substantiveTable(table))continue;
  for(const row of table.rows)if(!('played' in row)||row.played>0)ids.add(row.entityId);
 }
 for(const event of snapshot.events)if(datedEvent(event)){ids.add(event.homeId);ids.add(event.awayId);}
 return ids;
}

/** Publication must be established by the caller. Validation also checks dataset rights and dates. */
export function snapshotHasIndexableContent(snapshot:SportsSnapshot,now:Date|number=Date.now()):boolean{
 return validateSnapshot(snapshot,now).length===0&&(snapshot.tables.some(substantiveTable)||snapshot.events.some(datedEvent));
}

/** Entity metadata alone is not a profile; the current published season must contain its records. */
export function snapshotEntityHasIndexableContent(snapshot:SportsSnapshot,entityId:string,now:Date|number=Date.now()):boolean{
 return snapshotHasIndexableContent(snapshot,now)&&substantiveEntities(snapshot).has(entityId);
}

/**
 * Accept ONLY the repository's published snapshot list, never drafts or the coverage manifest.
 * Competition selection mirrors public pages: catalog edition before a newer archive revision.
 * Entity URLs are edition-scoped, matching their canonical metadata and visible record links.
 */
export function sportsSitemapClusters(published:readonly SportsSnapshot[]=[],now:Date|number=Date.now()):SportsSitemapCluster[]{
 const snapshots=orderSportsSnapshots(published.filter(snapshot=>validateSnapshot(snapshot,now).length===0));
 const current=new Set<string>(),seasons=new Set<string>(),clusters=new Map<string,SportsSitemapCluster>();
 const add=(snapshot:SportsSnapshot,path:(locale:InterfaceLocale)=>string)=>{
  const paths=Object.fromEntries(interfaceLocales.map(locale=>[locale,siteOrigin+path(locale)])) as Record<InterfaceLocale,string>;
  if(!clusters.has(paths.en))clusters.set(paths.en,{paths,lastmod:snapshot.observedAt});
 };
 for(const snapshot of snapshots){
  const isCurrent=!current.has(snapshot.competitionId);current.add(snapshot.competitionId);
  const token=snapshotSeasonToken(snapshot.season),seasonKey=`${snapshot.competitionId}/${token}`;
  const isSeason=!seasons.has(seasonKey);seasons.add(seasonKey);
  if(!snapshot.tables.some(substantiveTable)&&!snapshot.events.some(datedEvent))continue;
  if(isCurrent)add(snapshot,locale=>competitionPath(locale,snapshot.competitionId));
  if(isSeason){
   add(snapshot,locale=>`${competitionPath(locale,snapshot.competitionId)}/season/${token}`);
   for(const id of substantiveEntities(snapshot))add(snapshot,locale=>snapshotEntityPath(locale,snapshot,id));
  }
 }
 return [...clusters.values()].sort((a,b)=>a.paths.en.localeCompare(b.paths.en));
}
