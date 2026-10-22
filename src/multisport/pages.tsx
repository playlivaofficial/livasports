import type {Metadata} from 'next';
import Link from 'next/link';
import {IdentityLogo} from './IdentityLogo';
import {LeaguePulse} from './LeaguePulse';
import {FootballReading} from '@/editorial/FootballReading';
import {notFound} from 'next/navigation';
import {interfaceLocales,languageTags,type InterfaceLocale} from '@/localization/interface';
import {localizedAlternates,siteOrigin} from '@/seo/policy';
import {serializeJsonLd} from '@/seo/json-ld';
import {V2Shell} from '@/v2/pages';
import {translated} from './translation';
import {publishedNews} from '@/editorial/server';
import {NewsCard} from '@/editorial/NewsCards';
import {newsPath} from '@/editorial/copy';
import {usablePublishedNews} from '@/editorial/presentation';
import {competitions,competitionById,competitionPath,sportsPath,sportCompetitions,sportIds,sportName,sportIntroductions,isCatalogSport,snapshotSeasonToken,snapshotEntityPath,type CatalogSport,type Competition} from './catalog';
import {sportsCopy} from './copy';
import {SportsNav,StandingsTable,SnapshotSource,EventsList,EntityIdentity,SportMark} from './components';
import {publishedSnapshots} from './server';
import {localDataPreviewEnabled} from './local-preview';
import type {SportsSnapshot} from './model';
import {snapshotHasIndexableContent,snapshotEntityHasIndexableContent} from './seo';
import {officialCompetitionLink} from './official-links';
import {orderSportsSnapshots} from './ordering';
import {tableLabel} from './table-labels';

const storySport=(story:{sport?:string})=>story.sport??'football';
function Status({competition,locale}:{competition:Competition;locale:InterfaceLocale}){const c=sportsCopy(locale);return <span className="ms-status">{c[competition.status as keyof typeof c]??c.unverified}</span>;}
function DirectoryCards({items,locale,available}:{items:Competition[];locale:InterfaceLocale;available:Set<string>}){const c=sportsCopy(locale);return <div className="ms-directory">{items.map(item=><Link className="ms-competition-card" href={competitionPath(locale,item.id)} key={item.id}><div><span>{item.region}</span><Status competition={item} locale={locale}/></div><h3>{item.officialName}</h3><p>{item.season??c.unverified}</p><footer><span>{available.has(item.id)?c.records:c.overview}</span><b aria-hidden="true">↗</b></footer></Link>)}</div>;}
function PublishedTables({snapshots,locale}:{snapshots:SportsSnapshot[];locale:InterfaceLocale}){
 const c=sportsCopy(locale),tables=snapshots.filter(snapshot=>snapshot.tables.length);
 return <section className="v2-section" id="standings"><div className="v2-section-heading"><h2>{c.standings}</h2><span>{c.source}</span></div>{tables.length?<div className="ms-highlights">{tables.map(snapshot=><article className="ms-highlight" key={`${snapshot.competitionId}:${snapshot.season}`}><Link className="v2-text-link" href={competitionPath(locale,snapshot.competitionId)}>{competitionById(snapshot.competitionId)?.officialName} · {snapshot.season} ↗</Link><StandingsTable table={snapshot.tables[0]} snapshot={snapshot} locale={locale} limit={5}/><SnapshotSource snapshot={snapshot} locale={locale} downloadable={!localDataPreviewEnabled()}/></article>)}</div>:<p className="ms-note">{c.noTable}</p>}</section>;
}
export async function SportsDirectory({locale,sport}:{locale:InterfaceLocale;sport?:CatalogSport}){
 const c=sportsCopy(locale),[snapshots,news]=await Promise.all([publishedSnapshots(),publishedNews()]),available=new Set(snapshots.map(item=>item.competitionId));
 const stories=news.filter(item=>usablePublishedNews(item,new Date())&&(!sport||storySport(item)===sport)).slice(0,4);
 return <V2Shell locale={locale}><SportsNav locale={locale} active={sport??'all'}/><header className="ms-page-heading"><span className="v2-eyebrow">LIVASPORTS / {sport?sportName(sport,locale):c.sports}</span><h1>{sport?sportName(sport,locale):c.sports}</h1><p>{sport?translated(sportIntroductions[sport],locale):c.lead}</p></header>{stories.length?<section className="v2-section"><div className="v2-section-heading"><h2>{c.news}</h2><Link href={newsPath(locale)}>{c.news} ↗</Link></div><div className="ms-news-grid">{stories.map(item=><NewsCard item={item} locale={locale} key={item.slug}/>)}</div></section>:null}<PublishedTables snapshots={sport?snapshots.filter(item=>item.sport===sport):snapshots} locale={locale}/>{(sport?[sport]:sportIds).map(id=><section className="v2-section" key={id}><div className="v2-section-heading"><h2>{sport?c.competitions:sportName(id,locale)}</h2>{!sport?<Link href={sportsPath(locale,id)}>{sportName(id,locale)} ↗</Link>:null}</div><DirectoryCards items={sportCompetitions(id)} locale={locale} available={available}/></section>)}</V2Shell>;
}
function Unsupported({competition,locale}:{competition:Competition;locale:InterfaceLocale}){const c=sportsCopy(locale),official=officialCompetitionLink(competition.id);return <section className="ms-unavailable"><span className="v2-eyebrow">{c.coverage}</span><h2>{c.unsupported}</h2><p>{c.unavailable}</p>{official?<a className="v2-button v2-button-secondary" href={official.url} rel="noopener noreferrer">{official.scope==='governing-body'?c.governingBody:c.official} ↗</a>:null}</section>;}
const seasonToken=snapshotSeasonToken;
async function competitionContext(competitionId:string,season?:string){
 const competition=competitionById(competitionId);if(!competition)notFound();
 const snapshots=orderSportsSnapshots((await publishedSnapshots()).filter(item=>item.competitionId===competitionId));
 const snapshot=season?snapshots.find(item=>seasonToken(item.season)===season):snapshots[0];if(season&&!snapshot)notFound();
 return {competition,snapshots,snapshot};
}
export async function CompetitionPage({locale,competitionId,season}:{locale:InterfaceLocale;competitionId:string;season?:string}){
 const {competition:catalogCompetition,snapshots,snapshot}=await competitionContext(competitionId,season),c=sportsCopy(locale);
 const olderEdition=!!snapshot&&Number(snapshot.season.match(/\d{4}/)?.[0])<Number(catalogCompetition.season?.match(/\d{4}/)?.[0]);
 const competition=snapshot&&(snapshot.mode==='historical'||olderEdition)?{...catalogCompetition,status:'historical'}:catalogCompetition;
 const news=(await publishedNews()).filter(item=>usablePublishedNews(item,new Date())&&item.competition===competitionId).slice(0,4);
 return <V2Shell locale={locale}><SportsNav locale={locale} active={competition.sport==='football'?'football':competition.id}/><nav className="v2-breadcrumb"><Link href={sportsPath(locale,competition.sport)}>{sportName(competition.sport as CatalogSport,locale)}</Link><span>/</span><span>{competition.officialName}</span></nav><header className="ms-competition-heading"><IdentityLogo competitionId={competition.id}/><SportMark sport={competition.sport as CatalogSport} locale={locale}/><div><span className="v2-eyebrow">{competition.region}</span><h1>{competition.officialName}</h1><p>{snapshot?.season??competition.season??c.unverified} <Status competition={competition} locale={locale}/></p></div></header>{snapshot?<><nav className="ms-section-nav" aria-label={c.overview}><a href="#standings">{c.standings}</a><a href="#events">{c.matches}</a><a href="#competitors">{c.clubs}</a><a href="#source">{c.source}</a></nav>{snapshots.length>1?<div className="ms-season-picker"><span>{c.season}</span>{snapshots.map(item=><Link key={item.season} href={`${competitionPath(locale,competition.id)}/season/${encodeURIComponent(seasonToken(item.season))}`} aria-current={snapshot.season===item.season?'page':undefined}>{item.season}</Link>)}</div>:null}<section id="standings" className="v2-section"><div className="v2-section-heading"><h2>{c.standings}</h2><span>{tableLabel(snapshot.stage,locale)}</span></div>{snapshot.tables.length?snapshot.tables.map(table=><StandingsTable key={table.id} table={table} snapshot={snapshot} locale={locale}/>):<p className="ms-note">{c.noTable}</p>}</section><LeaguePulse snapshot={snapshot} locale={locale}/>{snapshot.seeds?.length?<section className="v2-section"><h2>{c.seeds}</h2><ul className="ms-seeds">{snapshot.seeds.map(seed=><li key={`${seed.draw}:${seed.seed}`}><strong>{seed.seed}</strong> {snapshot.entities.find(entity=>entity.id===seed.entityId)?.name} · {seed.draw} <time dateTime={seed.announcedAt}>{seed.announcedAt.slice(0,10)}</time></li>)}</ul></section>:null}<section id="events" className="v2-section"><details className="lp-all-events"><summary>{c.matches} <span>{snapshot.events.length} ↘</span></summary><p className="ms-note">{c.sourceDate}: {snapshot.observedAt.slice(0,10)}</p><EventsList snapshot={snapshot} locale={locale}/></details></section><section id="competitors" className="v2-section"><h2>{c.clubs}</h2><div className="ms-entity-grid">{snapshot.entities.map(entity=><EntityIdentity key={entity.id} entity={entity} snapshot={snapshot} locale={locale}/>)}</div><p className="ms-note">{c.noAffiliation}</p></section><div id="source"><SnapshotSource snapshot={snapshot} locale={locale} downloadable={!localDataPreviewEnabled()}/></div></>:<Unsupported competition={competition} locale={locale}/>}{news.length?<section className="v2-section"><h2>{c.related}</h2>{news.length?<div className="ms-news-grid">{news.map(item=><NewsCard item={item} locale={locale} key={item.slug}/>)}</div>:<p className="ms-note">{c.missingNews}</p>}<Link className="v2-text-link" href={newsPath(locale)}>{c.news} ↗</Link></section>:null}{competition.sport==='football'?<FootballReading locale={locale}/>:null}{snapshot?<script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@type':'Dataset',name:`${competition.officialName} · ${snapshot.season}`,description:`${snapshot.observationBasis==='source-revision'?c.revisionDate:c.sourceDate}: ${snapshot.observedAt}`,url:siteOrigin+competitionPath(locale,competition.id)+(season?'/season/'+seasonToken(snapshot.season):''),...(snapshot.observationBasis==='source-revision'?{}:{temporalCoverage:snapshot.observedAt}),creator:{'@type':'Organization',name:snapshot.sourceId},isAccessibleForFree:true})}}/>:null}</V2Shell>;
}
export async function EntityPage({locale,competitionId,entityId,season}:{locale:InterfaceLocale;competitionId:string;entityId:string;season?:string}){
 const {competition,snapshot}=await competitionContext(competitionId,season);const entity=snapshot?.entities.find(item=>item.id===entityId);if(!snapshot||!entity)notFound();const c=sportsCopy(locale);
 const tables=snapshot.tables.filter(table=>table.rows.some(row=>row.entityId===entity.id));
 return <V2Shell locale={locale}><SportsNav locale={locale}/><nav className="v2-breadcrumb"><Link href={competitionPath(locale,competitionId)+(season?'/season/'+seasonToken(snapshot.season):'')}>← {c.back}</Link></nav><header className="ms-page-heading"><span className="v2-eyebrow">{competition.officialName} · {snapshot.season}</span><h1>{entity.name}</h1>{entity.country?<p>{entity.country}</p>:null}<p>{c.profile}</p></header>{tables.map(table=><StandingsTable key={table.id} table={{...table,rows:table.rows.filter(row=>row.entityId===entity.id)} as typeof table} snapshot={snapshot} locale={locale}/>)}<section className="v2-section"><h2>{c.matches}</h2><EventsList snapshot={snapshot} locale={locale} entityId={entity.id}/></section><SnapshotSource snapshot={snapshot} locale={locale} downloadable={!localDataPreviewEnabled()}/><p className="ms-note">{c.noAffiliation}</p></V2Shell>;
}
export function resolveSportsRoute(parts:string[]){
 if(parts.length===0)return {kind:'directory' as const};
 if(!isCatalogSport(parts[0]))notFound();const sport=parts[0];if(parts.length===1)return {kind:'sport' as const,sport};
 const competition=competitionById(parts[1]);if(!competition||competition.sport!==sport)notFound();
 if(parts.length===2)return {kind:'competition' as const,sport,competitionId:competition.id};
 if(parts.length===6&&parts[2]==='season'&&/^[a-z0-9-]{1,64}$/.test(parts[3])&&parts[4]==='entities'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(parts[5]))return {kind:'entity' as const,sport,competitionId:competition.id,season:parts[3],entityId:parts[5]};
 if(parts.length===4&&parts[2]==='entities')return {kind:'entity' as const,sport,competitionId:competition.id,entityId:parts[3]};
 if(parts.length===4&&parts[2]==='season')return {kind:'competition' as const,sport,competitionId:competition.id,season:parts[3]};
 notFound();
}
export async function SportsRoute({locale,parts}:{locale:InterfaceLocale;parts:string[]}){const route=resolveSportsRoute(parts);if(route.kind==='directory'||route.kind==='sport')return <SportsDirectory locale={locale} sport={route.kind==='sport'?route.sport:undefined}/>;if(route.kind==='entity')return <EntityPage locale={locale} competitionId={route.competitionId} entityId={route.entityId} season={route.season}/>;return <CompetitionPage locale={locale} competitionId={route.competitionId} season={route.season}/>;}
export async function sportsMetadata(locale:InterfaceLocale,parts:string[]):Promise<Metadata>{
 const route=resolveSportsRoute(parts),c=sportsCopy(locale);let title=c.sports,index=true,path=(target:InterfaceLocale)=>sportsPath(target);
 if(route.kind==='sport'){title=sportName(route.sport,locale);path=target=>sportsPath(target,route.sport);}
 if(route.kind==='competition'||route.kind==='entity'){
  const {competition,snapshot}=await competitionContext(route.competitionId,route.season);title=competition.officialName;index=!!snapshot&&snapshotHasIndexableContent(snapshot);
  if(route.kind==='entity'){const entity=snapshot?.entities.find(item=>item.id===route.entityId);if(!entity||!snapshot)notFound();index=snapshotEntityHasIndexableContent(snapshot,entity.id);title=entity.name;path=target=>route.season?snapshotEntityPath(target,snapshot,entity.id):sportsPath(target,route.sport,route.competitionId,encodeURIComponent(entity.id));}
  else path=target=>competitionPath(target,route.competitionId)+(route.season?'/season/'+encodeURIComponent(route.season):'');
 }
 const paths=Object.fromEntries(interfaceLocales.map(target=>[target,path(target)])) as Record<InterfaceLocale,string>;
 // Indexable content inherits the root deployment policy; never override preview noindex.
 // Unsupported/thin records remain noindex even when the production root allows indexing.
 return {title,description:c.lead,metadataBase:new URL(siteOrigin),alternates:localizedAlternates(locale,paths),...(index?{}:{robots:{index:false,follow:true}}),openGraph:{title,description:c.lead,siteName:'LivaSports',url:paths[locale],type:'website',locale:languageTags[locale].replace('-','_')}};
}
export function sportsStaticParams(){return [{path:[]},...sportIds.map(sport=>({path:[sport]})),...competitions.map(item=>({path:[item.sport,item.id]}))];}
export function snapshotHasContent(snapshot:SportsSnapshot){return snapshot.tables.some(table=>table.rows.length)||snapshot.events.length>0;}
