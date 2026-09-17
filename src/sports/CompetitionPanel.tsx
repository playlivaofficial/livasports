import {headers} from 'next/headers';
import {requestTimeZone} from '@/localization/time-zone-server';
import Link from './SportsLink';
import {interfaceDictionary,interfaceRoutes,teamPath,playerPath,type InterfaceLocale} from '@/localization/interface';
import {TeamMark} from '@/components/sports/TeamMark';
import type {CompetitionHub} from './types';
import {competitionPath,competitionTabs,sportStage,sportGroup,type CompetitionTab} from './policy';
import {sportsCopy} from './copy';
import {MatchRows} from './MatchRows';
import {PendingRows} from './PendingMatch';
import {StandingsTable} from './StandingsTable';
import {unlinkedTeamLabel} from './unlinked-competition';
import {localizedCountry} from '@/profiles/localization';
import {competitionMark,countryMarkFromIso} from './country-mark';
import {requestCommercialGeo} from '@/odds/commercial-geo';
import {loadListingMatchOdds} from './runtime';
import {listingMatchWinnerOdds} from '@/odds/listing';
import type {FixtureView} from '@/delivery/types';
import {FixtureStatus} from '@/domain/enums';
import {CountryMarkIcon} from '@/components/sports/CountryMarkIcon';
import {FavoriteButton} from '@/favorites/FavoriteButton';

export async function CompetitionPanel({hub,locale,tab}:{hub:CompetitionHub;locale:InterfaceLocale;tab:CompetitionTab}){
  const timeZone=await requestTimeZone(locale);
  const t=sportsCopy[locale],dictionary=interfaceDictionary(locale);
  // Internal links use the canonical form: the default season carries no ?season parameter (P2 policy).
  const canonicalSeason=hub.season&&hub.season.id!==hub.defaultSeasonId?hub.season.id:undefined;
  const href=(next:CompetitionTab,page=1)=>competitionPath(locale,hub.slug,{tab:next,season:canonicalSeason,page});
  const seasonLinks=hub.seasons.filter(s=>s.fixtures>0).slice(0,6);
  const teamLink=(team:CompetitionHub['teams'][number]|null)=>team?<Link prefetch={false} className="sports-team-link" href={teamPath(locale,team.publicId,team.name)}><TeamMark initials={team.name.slice(0,2)} imageUrl={team.imageUrl}/><span>{team.name}</span></Link>:<span className="sports-data-note">{unlinkedTeamLabel(locale)}</span>;
  const pages=Math.max(1,Math.ceil((tab==='results'?hub.counts.results:Math.max(hub.counts.upcoming,hub.pendingTotal))/hub.pageSize));
  const groups=new Map<string,{label:string;rows:CompetitionHub['standings']}>();
  for(const row of hub.standings){const key=JSON.stringify([row.stage,row.group]);const group=groups.get(key)??{label:[sportStage(locale,row.stage),sportGroup(locale,row.group)].filter(Boolean).join(' · '),rows:[]};group.rows.push(row);groups.set(key,group);}
  const capability=tab==='results'||tab==='fixtures'?'FIXTURES':tab.toUpperCase();
  // A capability endpoint can be empty while another stored source supplies this view.
  const availableRows={fixtures:hub.counts.upcoming+hub.pendingTotal,results:hub.counts.results,standings:hub.standings.length,scorers:hub.scorers.length,teams:hub.teams.length}[tab];
  const state=availableRows>0?undefined:hub.availability[capability]?.status;
  const noData=state==='EMPTY'?(locale==='br'?'A fonte não informa dados para esta temporada.':locale==='mx'?'La fuente no informa datos para esta temporada.':'The source reports no data for this season.'):state==='UNAVAILABLE'?(locale==='br'?'Este dado não está disponível na cobertura da fonte.':locale==='mx'?'Este dato no está disponible en la cobertura de la fuente.':'This information is unavailable within the source coverage.'):null;
  const alternateSeason=hub.seasons.find(season=>season.id!==hub.season?.id&&season.fixtures>0);
  const pagination=<nav className="sports-pagination" aria-label={t.page}>{hub.page>1?<Link prefetch={false} href={href(tab,hub.page-1)}>← {t.previous}</Link>:<span/>}<span>{t.page} {hub.page} / {pages}</span>{hub.page<pages?<Link prefetch={false} href={href(tab,hub.page+1)}>{t.next} →</Link>:<span/>}</nav>;
  const mark=competitionMark({slug:hub.slug,countryCode:hub.countryCode,countryName:hub.country,region:hub.region});
  const roundContext=sportStage(locale,hub.upcoming[0]?.round??hub.results[0]?.round);
  const upcomingOdds=tab==='fixtures'?await loadListingMatchOdds(hub.upcoming.filter(row=>row.status==='SCHEDULED').map(row=>row.id),requestCommercialGeo(await headers())).catch(()=>new Map()):new Map();
  const oddsViews:Record<string,FixtureView>={};
  for(const row of hub.upcoming){
    const snapshot=upcomingOdds.get(row.id);
    const attached=snapshot&&row.status==='SCHEDULED'?listingMatchWinnerOdds(snapshot):{odds:[],oddsState:'none' as const};
    oddsViews[row.id]={id:row.id,publicId:row.publicId,competition:row.competition,homeTeam:row.home.name,awayTeam:row.away.name,kickoff:row.kickoff,status:row.status as FixtureStatus,homeScore:row.homeScore,awayScore:row.awayScore,freshness:'fresh',odds:attached.odds,oddsState:attached.oddsState};
  }
  return <section className="competition-hub" aria-label={hub.name}>
    <div className="sports-hub-context"><Link prefetch={false} href={interfaceRoutes[locale].football}>{dictionary.navigation.football}</Link><span aria-hidden="true">/</span><CountryMarkIcon mark={mark}/>{hub.country?<><span>{locale==='en'?hub.country:localizedCountry(locale,hub.country)}</span><span aria-hidden="true">/</span></>:null}<strong>{hub.name}</strong><FavoriteButton locale={locale} kind="competition" id={hub.slug} className="favorite-toggle-compact"/>{roundContext?<span>· {t.round} {roundContext}</span>:null}</div>
    <form className="sports-season" action={interfaceRoutes[locale].football}>
      <input type="hidden" name="competition" value={hub.slug}/><input type="hidden" name="tab" value={tab}/>
      <label htmlFor="competition-season">{t.season}</label><select id="competition-season" name="season" defaultValue={hub.season?.id??''} disabled={!hub.seasons.length}>{!hub.season?<option value="">{t.noSeason}</option>:null}{hub.seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="submit" disabled={!hub.seasons.length}>{t.apply}</button>
    </form>
    {seasonLinks.length>1?<nav className="sports-profile-contexts" aria-label={t.allSeasons}>{seasonLinks.map(s=><Link prefetch={false} key={s.id} href={competitionPath(locale,hub.slug,{tab,season:s.id===hub.defaultSeasonId?undefined:s.id})} aria-current={s.id===hub.season?.id?'page':undefined}>{s.name}</Link>)}</nav>:null}
    {hub.seasonFallback&&hub.season?<p className="sports-data-note" role="status">{locale==='br'?`Exibindo ${hub.season.name}. A fonte ainda não informa dados para ${hub.seasonFallback.name}.`:locale==='mx'?`Mostrando ${hub.season.name}. La fuente aún no informa datos para ${hub.seasonFallback.name}.`:`Showing ${hub.season.name}. The source has not yet published data for ${hub.seasonFallback.name}.`} <Link prefetch={false} href={competitionPath(locale,hub.slug,{season:hub.seasonFallback.id,tab})}>{t.season} {hub.seasonFallback.name} →</Link></p>:null}
    <nav className="sports-section-tabs" aria-label={t.competition}>{competitionTabs.map(key=><Link prefetch={false} key={key} href={href(key)} data-competition-tab={key} aria-current={tab===key?'page':undefined}>{t[key]}</Link>)}</nav>
    {!hub.season?<p className="sports-empty">{t.noSeason}</p>:<>
      {noData&&tab!=='fixtures'&&tab!=='results'?<p className="sports-data-note" role="status">{noData}</p>:null}
      {!hub.season.fixtures&&alternateSeason?<p className="sports-data-note"><Link prefetch={false} href={competitionPath(locale,hub.slug,{season:alternateSeason.id,tab})}>{t.viewAll}: {alternateSeason.name} →</Link></p>:null}
      {tab==='fixtures'||tab==='results'?<><h2 className="sports-panel-title">{t[tab]}<small>{hub.season.name}</small></h2>{tab==='results'||hub.upcoming.length||!hub.pending.length?<MatchRows locale={locale} rows={tab==='results'?hub.results:hub.upcoming} empty={tab==='results'?t.noResults:t.noFixtures} oddsViews={tab==='fixtures'?oddsViews:undefined} commercialLocale={locale==='en'?'br':locale}/>:null}{tab==='fixtures'?<><PendingRows locale={locale} rows={hub.pending}/>{hub.results.length?<section className="sports-fixtures-recent" aria-label={t.recent}><h2 className="sports-panel-title">{t.recent}<Link prefetch={false} href={href('results')}>{t.viewAll} →</Link></h2><MatchRows locale={locale} rows={hub.results.slice(0,5)} empty={t.noResults}/></section>:null}</>:null}{pagination}</>:null}
      {tab==='standings'?<><h2 className="sports-panel-title">{t.standings}<small>{hub.season.name}</small></h2>{!hub.standings.length?<p className="sports-empty" role="status">{t.noStandings}</p>:[...groups].map(([key,{label,rows}])=><section key={key} className="sports-table-group">{label?<h3>{label}</h3>:null}<StandingsTable locale={locale} rows={rows} label={`${hub.name} ${hub.season?.name} ${label}`}/></section>)}{hub.standings.length?<p className="sports-data-note">{t.tableNote} {hub.standings[0].updatedAt?`${t.saved} ${new Intl.DateTimeFormat(dictionary.locale,{dateStyle:'short',timeStyle:'short',timeZone}).format(new Date(hub.standings[0].updatedAt))}.`:''}</p>:null}</>:null}
      {tab==='scorers'?<><h2 className="sports-panel-title">{t.scorers}<small>{hub.season.name}</small></h2>{hub.scorers.length?<><div className="sports-table-scroll" tabIndex={0} role="region" aria-label={t.scorers}><table className="sports-table sports-scorers"><thead><tr><th>#</th><th>{t.player}</th><th>{t.goals}</th><th>{t.assists}</th><th>{t.appearances}</th><th>{t.minutes}</th></tr></thead><tbody>{hub.scorers.map(p=>{const playerMark=countryMarkFromIso(p.countryCode,p.nationality);return <tr key={p.sourceKey??`${p.publicId}:${p.team?.id}`}><td>{p.rank}</td><th scope="row"><span className="sports-player-name">{p.countryCode?<CountryMarkIcon mark={playerMark} decorative={false}/>:null}{p.publicId?<Link prefetch={false} href={playerPath(locale,p.publicId,p.name)}>{p.name}</Link>:<span>{p.name}</span>}</span><small>{teamLink(p.team)}</small></th>{[p.goals,p.assists,p.appearances,p.minutes].map((v,i)=><td key={i}>{v??'—'}</td>)}</tr>;})}</tbody></table></div><p className="sports-data-note">{t.scorerNote}</p></>:<p className="sports-empty" role="status">{t.noScorers}</p>}</>:null}
      {tab==='teams'?<><h2 className="sports-panel-title">{t.teams}<small>{hub.season.name}</small></h2>{hub.teams.length?<div className="sports-teams-grid">{hub.teams.map(team=><article key={team.id} className="sports-team-card">{teamLink(team)}<FavoriteButton locale={locale} kind="team" id={team.publicId} className="favorite-toggle-compact"/>{hub.standings.find(s=>s.team?.id===team.id)?<small>{t.standings}: {hub.standings.find(s=>s.team?.id===team.id)?.position}</small>:null}</article>)}</div>:<p className="sports-empty" role="status">{t.noTeams}</p>}</>:null}
    </>}
    <p className="sports-data-note">{t.coverage}</p>
  </section>;
}
