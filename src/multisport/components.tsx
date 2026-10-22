import Link from 'next/link';
import {IdentityLogo} from './IdentityLogo';
import type {InterfaceLocale} from '@/localization/interface';
import {newsDate} from '@/editorial/copy';
import {sportsPath,competitionPath,sportName,snapshotEntityPath,type CatalogSport} from './catalog';
import {sportsCopy} from './copy';
import {snapshotFreshness,type SportsSnapshot,type SportsTable,type SportsEntity} from './model';
import {getSportsSource} from './sources';
import {tableLabel} from './table-labels';

export function SportsNav({locale,active}:{locale:InterfaceLocale;active?:string}){
 const labels=sportsCopy(locale);
 const links=[{label:sportName('football',locale),path:sportsPath(locale,'football'),id:'football'},{label:'NBA',path:competitionPath(locale,'nba'),id:'nba'},{label:'EuroLeague',path:competitionPath(locale,'euroleague'),id:'euroleague'},{label:'MLB',path:competitionPath(locale,'mlb'),id:'mlb'},{label:'NFL',path:competitionPath(locale,'nfl'),id:'nfl'},{label:'NHL',path:competitionPath(locale,'nhl'),id:'nhl'},{label:'UFC',path:competitionPath(locale,'ufc'),id:'ufc'},{label:sportName('tennis',locale),path:sportsPath(locale,'tennis'),id:'tennis'}];
 return <nav className="ms-sport-nav" aria-label={labels.sports}><Link className="ms-all-sports" href={sportsPath(locale)} aria-current={active==='all'?'page':undefined}>{labels.sports} <span aria-hidden="true">↗</span></Link>{links.map(link=><Link key={link.id} href={link.path} aria-current={active===link.id?'page':undefined}>{link.label}</Link>)}</nav>;
}

export function EntityIdentity({entity,locale,snapshot}:{entity:SportsEntity;locale:InterfaceLocale;snapshot:SportsSnapshot}){
 return <Link className="ms-entity" href={snapshotEntityPath(locale,snapshot,entity.id)}><IdentityLogo competitionId={snapshot.competitionId} teamName={entity.name}/><span>{entity.name}{entity.country?<small>{entity.country}</small>:null}</span></Link>;
}
type Column={key:string;label:string;full:string};
function columns(table:SportsTable,locale:InterfaceLocale):Column[]{
 const c=sportsCopy(locale),field=(key:string,label:string,full=label)=>({key,label,full});
 switch(table.type){
  case 'football':return [field('played',c.played),field('won',c.won),field('drawn',c.drawn),field('lost',c.lost),field('goalsFor',c.goalsFor),field('goalsAgainst',c.goalsAgainst),field('goalDifference',c.goalDifference),field('points',c.points)];
  case 'basketball':return [field('played',c.played),field('wins',c.won),field('losses',c.lost),field('winPercentage',c.percentage),...(table.rows.some(row=>row.gamesBehind!==undefined)?[field('gamesBehind',c.gamesBehind)]:[]),...(['pointsFor','pointsAgainst'] as const).filter(key=>table.rows.some(row=>row[key]!==undefined)).map(key=>field(key,key==='pointsFor'?'PF':'PA'))];
  case 'baseball':return [field('played',c.played),field('wins',c.won),field('losses',c.lost),field('winPercentage',c.percentage),field('gamesBehind',c.gamesBehind),...(['runsFor','runsAgainst'] as const).filter(key=>table.rows.some(row=>row[key]!==undefined)).map(key=>field(key,key==='runsFor'?'RF':'RA'))];
  case 'american-football':return [field('played',c.played),field('wins',c.won),field('losses',c.lost),field('ties',c.ties),field('winPercentage',c.percentage),field('pointsFor','PF'),field('pointsAgainst','PA')];
  case 'ice-hockey':return [field('points',c.points),field('played',c.played),field('wins',c.won),field('losses',c.lost),field('overtimeLosses',c.overtimeLosses),field('goalsFor',c.goalsFor),field('goalsAgainst',c.goalsAgainst),field('goalDifference',c.goalDifference),...(table.rows.some(row=>row.regulationWins!==undefined)?[field('regulationWins','RW')]:[])];
  case 'tennis':return [field('points',c.points),...(table.rows.some(row=>'movement' in row)?[field('movement',c.movement)]:[])];
  case 'mma':return [field('champion',c.champion),...(['wins','losses','draws','noContests'] as const).filter(key=>table.rows.some(row=>row[key]!==undefined)).map(key=>field(key,{wins:c.won,losses:c.lost,draws:c.drawn,noContests:'NC'}[key]))];
 }
}
function freshnessLabel(status:ReturnType<typeof snapshotFreshness>['status'],locale:InterfaceLocale){
 const c=sportsCopy(locale);
 return status==='fresh'?c.fresh:status==='historical'?c.historical:status==='unconfirmed'?c.unconfirmed:status==='invalid'?c.invalidDate:c.stale;
}
function SourceObservation({snapshot,locale}:{snapshot:SportsSnapshot;locale:InterfaceLocale}){
 const value=snapshot.observedAt;
 if(!Number.isFinite(Date.parse(value)))return <span>{sportsCopy(locale).invalidDate}</span>;
 return <time dateTime={value}>{value.length===10?newsDate(value,locale):new Intl.DateTimeFormat(locale==='en'?'en-GB':locale==='br'?'pt-BR':'es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC'}</time>;
}
export function StandingsTable({table,snapshot,locale,limit,compact=false}:{table:SportsTable;snapshot:SportsSnapshot;locale:InterfaceLocale;limit?:number;compact?:boolean}){
 const c=sportsCopy(locale),freshness=snapshotFreshness(snapshot),allFields=columns(table,locale),entities=new Map(snapshot.entities.map(entity=>[entity.id,entity]));
 const key=['football','ice-hockey','tennis'].includes(table.type)?'points':table.type==='mma'?'champion':'winPercentage';
 const fields=compact?allFields.filter(field=>field.key==='played'||field.key===key):allFields;
 const cell=(row:SportsTable['rows'][number],key:string)=>{const record=row as unknown as Record<string,unknown>;if(key==='goalDifference'&&table.type==='ice-hockey')return Number(record.goalsFor)-Number(record.goalsAgainst);const value=record[key];if(key==='champion')return value===true?c.champion:'—';if(value===undefined)return '—';return typeof value==='number'&&key==='winPercentage'?value.toFixed(3):String(value);};
 return <section className={`ms-table-card${compact?' ms-table-preview':''}`}><div className="ms-table-title"><h3>{tableLabel(table.name,locale)}</h3><span>{[table.conference?tableLabel(table.conference,locale):undefined,table.division?tableLabel(table.division,locale):undefined,table.group,table.type==='mma'&&table.rankingSystem?(table.rankingSystem==='meta'?'Meta UFC':'Media panel'):undefined,table.type==='mma'?(table.rankingCategory==='weight-class'?table.weightClass:c.poundForPound):undefined].filter(Boolean).join(' · ')}</span>{'rankingDate' in table?<time dateTime={table.rankingDate}>{newsDate(table.rankingDate,locale)}</time>:null}</div><p className={`ms-table-freshness ms-table-freshness-${freshness.status}`} role="note"><strong>{freshnessLabel(freshness.status,locale)}</strong><span>{snapshot.observationBasis==='source-revision'?c.revisionDate:c.sourceDate}: <SourceObservation snapshot={snapshot} locale={locale}/></span></p><div className="ms-table-scroll" tabIndex={0} role="region" aria-label={`${tableLabel(table.name,locale)}. ${c.tableHelp}`}><table className={`ms-table ms-table-${table.type}`}><thead><tr><th scope="col">{c.rank}</th><th scope="col">{table.type==='mma'?c.fighter:table.type==='tennis'?c.player:c.team}</th>{fields.map(field=><th scope="col" key={field.key} title={field.full}>{field.label}</th>)}</tr></thead><tbody>{table.rows.slice(0,limit??table.rows.length).map(row=><tr key={row.entityId}><td>{table.type==='mma'&&row.rank===0?'C':row.rank}</td><th scope="row">{entities.get(row.entityId)?<EntityIdentity entity={entities.get(row.entityId)!} snapshot={snapshot} locale={locale}/>:row.entityId}</th>{fields.map(field=><td key={field.key} className={field.key==='points'?'ms-points':undefined}>{cell(row,field.key)}</td>)}</tr>)}</tbody></table></div>{table.type==='football'&&!compact?<p className="ms-table-legend">{locale==='en'?'P played · W wins · D draws · L losses · GF goals for · GA goals against · GD goal difference · PTS points':locale==='br'?'J jogos · V vitórias · E empates · D derrotas · GP gols pró · GC gols contra · SG saldo · PTS pontos':'PJ partidos · G ganados · E empates · P perdidos · GF goles a favor · GC goles en contra · DG diferencia · PTS puntos'}</p>:null}</section>;
}
export function SnapshotSource({snapshot,locale,downloadable=true}:{snapshot:SportsSnapshot;locale:InterfaceLocale;downloadable?:boolean}){
 const c=sportsCopy(locale),freshness=snapshotFreshness(snapshot),source=getSportsSource(snapshot.sourceId);
 return <aside className={`ms-source ms-source-${freshness.status}`}><strong>{freshnessLabel(freshness.status,locale)}</strong><dl><div><dt>{snapshot.observationBasis==='source-revision'?c.revisionDate:c.sourceDate}</dt><dd><SourceObservation snapshot={snapshot} locale={locale}/></dd></div><div><dt>{c.retrieved}</dt><dd><time dateTime={snapshot.retrievedAt}>{newsDate(snapshot.retrievedAt,locale)}</time></dd></div></dl><div className="ms-source-links"><a href={snapshot.sourceUrl} rel="noopener noreferrer">{source?.name??snapshot.sourceId} ↗</a>{source?.licenseUrl?<a href={source.licenseUrl} rel="license noopener noreferrer">{source.licenseId}</a>:null}{downloadable?<a href={`/api/public/sports/snapshots/${encodeURIComponent(snapshot.competitionId)}?season=${encodeURIComponent(snapshot.season)}`} download>{c.download} ↓</a>:null}</div>{['openligadb','wikimedia'].includes(snapshot.sourceId)?<p>{c.community}</p>:null}{snapshot.sourceId==='wikimedia'?<><p>{c.adapted}</p><details><summary>{c.sourceRevisions}</summary><ul>{snapshot.provenance?.map(revision=><li key={revision.title}><a href={`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(revision.title)}&oldid=${revision.revisionId}`} rel="noopener noreferrer">{revision.title} · #{revision.revisionId}</a></li>)}</ul></details></>:null}</aside>;
}
export function EventsList({snapshot,locale,entityId}:{snapshot:SportsSnapshot;locale:InterfaceLocale;entityId?:string}){
 const c=sportsCopy(locale),events=snapshot.events.filter(event=>!entityId||event.homeId===entityId||event.awayId===entityId),entities=new Map(snapshot.entities.map(entity=>[entity.id,entity]));
 const groups=new Map<string,typeof events>();for(const event of events){const key=[event.stage,event.round,event.group].filter(Boolean).join(' · ');groups.set(key,[...(groups.get(key)??[]),event]);}
 if(!events.length)return <p className="ms-note">{c.noEvents}</p>;
 return <div className="ms-events">{[...groups].map(([label,group],index)=><details key={label} open={index===0}><summary>{label}<span>{group.length}</span></summary><div>{group.map(event=>{
  const winner=event.outcome==='home-win'?entities.get(event.homeId):event.outcome==='away-win'?entities.get(event.awayId):undefined;
  const pastScheduled=event.status==='scheduled'&&(event.start?Date.parse(event.start)<Date.now():event.date?event.date<new Date(Date.now()).toISOString().slice(0,10):false);
  return <article className="ms-event" key={event.id}>
   <div className="ms-event-date">{event.start?<time dateTime={event.start}>{newsDate(event.start,locale)}<small>{new Date(event.start).toISOString().slice(11,16)} UTC</small></time>:event.date?<time dateTime={event.date}>{newsDate(event.date,locale)}</time>:c.datePending}<span>{pastScheduled?c.resultPending:c[event.status]}</span></div>
   <div className="ms-event-teams">{[event.homeId,event.awayId].map(id=>{const entity=entities.get(id);return entity?<EntityIdentity key={id} entity={entity} snapshot={snapshot} locale={locale}/>:null;})}</div>
   <div className="ms-event-score">{event.scores?<><strong>{event.scores.home}</strong><strong>{event.scores.away}</strong></>:<span>—</span>}</div>
   {winner||event.outcome==='draw'||event.outcome==='no-contest'||event.method?<p className="ms-event-detail">{winner?<strong>{c.winner}: {winner.name}</strong>:event.outcome==='draw'?c.draw:event.outcome==='no-contest'?c.noContest:null}{event.method?<span>{event.method}</span>:null}</p>:null}
   {event.scores?.periods?.length?<ul className="ms-event-periods">{event.scores.periods.map(period=><li key={period.label}><span>{period.label}</span><strong>{period.home} – {period.away}</strong></li>)}</ul>:null}
  </article>;
 })}</div></details>)}</div>;
}
export function SportMark({sport,locale}:{sport:CatalogSport;locale:InterfaceLocale}){return <span className="ms-sport-mark" data-sport={sport}>{sportName(sport,locale)}</span>;}
