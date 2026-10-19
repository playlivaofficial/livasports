import Link from 'next/link';
import type {InterfaceLocale} from '@/localization/interface';
import {publishedSnapshots} from './server';
import {localDataPreviewEnabled} from './local-preview';
import {competitionById,competitionPath,sportsPath} from './catalog';
import {sportsCopy} from './copy';
import {StandingsTable,SnapshotSource} from './components';
import {snapshotFreshness} from './model';
export async function StandingsHighlights({locale}:{locale:InterfaceLocale}){
 const c=sportsCopy(locale),snapshots=(await publishedSnapshots()).filter(item=>snapshotFreshness(item).status==='fresh'&&item.tables.length).slice(0,2);
 if(!snapshots.length)return null;
 return <section className="v2-section" id="standings"><div className="v2-section-heading"><h2>{c.standings}</h2><Link href={sportsPath(locale)}>{c.competitions} ↗</Link></div><div className="ms-highlights">{snapshots.map(snapshot=><article key={snapshot.competitionId} className="ms-highlight"><StandingsTable table={snapshot.tables[0]} snapshot={snapshot} locale={locale} limit={5}/><Link href={competitionPath(locale,snapshot.competitionId)}>{competitionById(snapshot.competitionId)?.officialName} · {snapshot.season} ↗</Link><SnapshotSource snapshot={snapshot} locale={locale} downloadable={!localDataPreviewEnabled()}/></article>)}</div></section>;
}
