import {resolveTimeZone} from '@/localization/time-zone';
import {LocalizedTimeText} from '@/localization/LocalizedTime';
import {MatchTimeZone} from '@/components/match/MatchTimeZone';
import {MatchHistory} from '@/sports/MatchHistory';
import {EventPeople} from '@/sports/EventPeople';
import {competitionPath,sportStage} from '@/sports/policy';
import Link from '@/sports/SportsLink';
import { FixtureStatus } from '@/domain/enums';
import {interfaceDictionary as getDictionary,interfaceRoutes as localeRoutes} from './interface';
type SiteLocale='en';
import type { MatchCenterView, MatchEventView, MatchModule, MatchStatisticView } from '@/match-center/types';
import {matchPath,teamPath,playerPath} from './interface';
import { eventTiming, orderedMatchEvents } from '@/match-center/rules';

import { SiteHeader } from '@/components/sports/SiteHeader';
import { TeamIdentity } from '@/components/sports/FixtureCard';
import {EnglishShare as MatchClientActions} from './EnglishShare';
import {SectionNav as MatchSectionNav} from '@/components/sports/SectionNav';
import { PregameOdds } from '@/components/match/PregameOdds';
import { LiveRefreshBoundary } from '@/components/match/LiveRefreshBoundary';
import { NextMatches } from '@/components/match/NextMatches';
import { isFinishedMatchDecayed } from '@/seo/policy';
import { SponsoredSlot } from '@/components/commercial/SponsoredSlot';
import { FavoriteButton } from '@/favorites/FavoriteButton';
import { matchPath as brMatchPath } from '@/match-center/routes';




const copy={en:{"back":"Back to matches","summary":"Summary","statistics":"Statistics","lineups":"Lineups","meetings":"Head-to-head","standings":"Standings","timezone":"UTC","venue":"Stadium","round":"Round","stage":"Stage","season":"Season","timeline":"Key events","noEvents":"No detailed events are available.","lineupPending":"Lineups have not been announced.","unavailable":"Data is unavailable for this match.","notApplicable":"This section does not apply to this stage.","stale":"Latest available snapshot","starters":"Starting XI","bench":"Substitutes","coach":"Coach","formation":"Formation","recent":"Recent form","h2h":"Previous meetings","sample":"matches in sample","noSample":"No sample available","played":"P","won":"W","draw":"D","lost":"L","goals":"Goals","points":"Pts","share":"Share","copied":"Link copied","pending":"Not yet available for this match.","noData":"No information has been recorded for this match.","notCovered":"This information is not covered by the source.","temporaryError":"This section is temporarily unavailable.","liveStale":"Live updates are delayed. Showing the latest saved information.","replay":"Historical replay — this is not a live match.","playerPerformance":"Player performances"}} as const;
const preferredStats=[/possession/i,/shots total/i,/shots on target/i,/corners/i,/fouls/i,/offsides/i,/yellow cards/i,/red cards/i];
const eventLabels:Record<SiteLocale,Record<string,string>>={en:{"Goal":"Goal","Substitution":"Substitution","Yellowcard":"Yellow card","Yellow Card":"Yellow card","Redcard":"Red card","Red Card":"Red card","Penalty":"Penalty","Own Goal":"Own goal","VAR":"VAR"}};
const statisticLabels:Record<SiteLocale,Record<string,string>>={en:{"Throwins":"Throw-ins","Yellowcards":"Yellow cards","Redcards":"Red cards","Ball Possession %":"Ball possession","Shots Insidebox":"Shots inside the box","Shots Outsidebox":"Shots outside the box"}};
const scoreLabels:Record<SiteLocale,Record<string,string>>={en:{"PENALTIES":"Penalties","EXTRA_TIME":"Extra time","AGGREGATE":"Aggregate"}};
const playerStatisticLabels:Record<SiteLocale,Record<string,string>>={en:{"MINUTES_PLAYED":"min","MINUTES":"min","GOALS":"goals","ASSISTS":"assists","YELLOWCARDS":"yellow cards","REDCARDS":"red cards","SHOTS":"shots","SHOTS_TOTAL":"shots","SHOTS_ON_TARGET":"on target","SAVES":"saves","PASSES":"passes","RATING":"rating"}};
function prioritizedStats(rows: MatchStatisticView[]) {
  const preferred = preferredStats.flatMap(rule => rows.filter(row => rule.test(row.type)));
  return [...preferred, ...rows].filter((row, index, all) => all.findIndex(item => item.type === row.type && item.scope === row.scope) === index);
}
function displayState<T>(locale: SiteLocale, module: MatchModule<T>, pending?: string): string {
  const text = copy[locale];
  if (module.state === 'NOT_YET_AVAILABLE') return pending ?? text.pending;
  if (module.state === 'NOT_APPLICABLE') return text.notApplicable;
  if (module.state === 'STALE') return text.stale;
  if (module.state === 'NOT_COVERED') return text.notCovered;
  if (module.state === 'NO_DATA_IN_WINDOW') return text.noData;
  if (module.state === 'ERROR') return text.temporaryError;
  return text.unavailable;
}
function minute(event: MatchEventView): string { return eventTiming(event); }
function statusLabel(locale: SiteLocale, status: FixtureStatus) { return getDictionary(locale).statuses[status]; }

function ModuleState({ locale, module, pending }: { locale: SiteLocale; module: MatchModule<unknown>; pending?: string }) {
  return <p className="match-module-empty">{displayState(locale, module, pending)}</p>;
}

function ScoreBreakdown({ locale, match }: { locale: SiteLocale; match: MatchCenterView }) {
  const special = match.header.scores.filter(row => ['PENALTIES','EXTRA_TIME','AGGREGATE'].includes(row.description.toUpperCase()));
  if (!special.length) return null;
  return <div className="score-breakdown">{special.map(row => <span key={row.description}>{scoreLabels[locale][row.description.toUpperCase()] ?? row.description.replaceAll('_',' ')}: {row.home ?? '—'}–{row.away ?? '—'}</span>)}</div>;
}

function Summary({ locale, match }: { locale: SiteLocale; match: MatchCenterView }) {
  const text = copy[locale];
  const localizedStage = sportStage(locale,match.header.stage),localizedRound=sportStage(locale,match.header.round);
  const facts = [match.header.season && [text.season, match.header.season], localizedRound && [text.round, localizedRound], localizedStage && [text.stage, localizedStage],
    match.header.venue && [text.venue, `${match.header.venue}${match.header.venueCity ? ` · ${match.header.venueCity}` : ''}`]].filter(Boolean) as string[][];
  return <section id="summary" className="match-panel"><h2>{text.summary}</h2>
    <div className="match-facts">{facts.map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <ScoreBreakdown locale={locale} match={match} />
    {match.events.data.length ? <><h3>{text.timeline}</h3><ol className="event-list">{orderedMatchEvents(match.events.data).filter(event => !event.rescinded).map(event => <li key={event.id}>
      <time>{minute(event)}</time><span className="event-dot" aria-hidden="true"/><div><strong>{eventLabels[locale][event.type] ?? event.type}</strong>
        {[match.header.home,match.header.away].find(team=>team.id===event.teamId)?.name?<small className="event-team">{[match.header.home,match.header.away].find(team=>team.id===event.teamId)!.name}</small>:null}
        <EventPeople event={event} locale={locale}/></div>
    </li>)}</ol></> : <ModuleState locale={locale} module={match.events} />}
  </section>;
}

function Statistics({ locale, module }: { locale: SiteLocale; module: MatchCenterView['statistics'] }) {
  const text=copy[locale]; const rows=prioritizedStats(module.data);
  return <section id="statistics" className="match-panel"><h2>{text.statistics}</h2>{rows.length ? <div className="stats-list">{rows.map(row => {
    const home=typeof row.home==='number'?row.home:null,away=typeof row.away==='number'?row.away:null,total=(home??0)+(away??0); const homeShare=total>0&&home!==null?home/total*100:50;
    return <div className="stat-row" key={`${row.type}:${row.scope}`}><div><strong>{row.home ?? '—'}{row.unit}</strong><span>{statisticLabels[locale][row.type] ?? row.type}</span><strong>{row.away ?? '—'}{row.unit}</strong></div><div className="stat-bar"><i style={{width:`${homeShare}%`}}/><b/></div></div>;
  })}</div>:<ModuleState locale={locale} module={module}/>}</section>;
}

function Lineups({ locale, match }: { locale: SiteLocale; match: MatchCenterView }) {
  const text=copy[locale];
  const playerRow=(player:MatchCenterView['lineups']['data'][number]['starters'][number])=>{const visible=(player.statistics??[])
    .filter(row=>Boolean(playerStatisticLabels[locale][row.code])).slice(0,4);
    return <li key={player.id}><span>{player.jerseyNumber??'—'}</span><div>{player.playerPublicId?<Link href={playerPath(locale,player.playerPublicId,player.name)}>{player.name}</Link>:player.name}
      {visible.length?<small>{visible.map(row=>`${row.value} ${playerStatisticLabels[locale][row.code]}`).join(' · ')}</small>:null}</div></li>;};
  return <section id="lineups" className="match-panel"><h2>{text.lineups}</h2>{match.lineups.data.length ? <div className="lineup-columns">{match.lineups.data.map(team => {
    const identity=team.teamId===match.header.home.id?match.header.home:match.header.away;
    return <article className="lineup-team" key={team.teamId}><h3>{identity.name}</h3><p className="lineup-meta">{team.formation?`${text.formation} ${team.formation}`:''}{team.coach?` · ${text.coach}: ${team.coach}`:''}</p>
      <h4>{text.starters}</h4><ol>{team.starters.map(playerRow)}</ol>
      <h4>{text.bench}</h4><ol>{team.substitutes.map(playerRow)}</ol>
    </article>;
  })}</div>:<ModuleState locale={locale} module={match.lineups} pending={text.lineupPending}/>}</section>;
}

function Form({ locale, match }: { locale: SiteLocale; match: MatchCenterView }) {
  const text=copy[locale];
  const history=(title:string,rows:MatchCenterView['form']['data']['home'])=><MatchHistory title={title} rows={rows} locale={locale}/>;
  return <section id="meetings" className="match-panel"><h2>{text.meetings}</h2><div className="form-grid">{history(match.header.home.name,match.form.data.home)}{history(match.header.away.name,match.form.data.away)}{history(text.h2h,match.form.data.headToHead)}</div></section>;
}

function Standings({ locale, match }: { locale: SiteLocale; match: MatchCenterView }) {
  const text=copy[locale];
  return <section id="standings" className="match-panel"><h2>{text.standings}</h2>{match.standings.data.length?<div className="standing-scroll"><table><thead><tr><th>#</th><th>{getDictionary(locale).labels.teams}</th><th>{text.played}</th><th>{text.won}</th><th>{text.draw}</th><th>{text.lost}</th><th>{text.goals}</th><th>{text.points}</th></tr></thead><tbody>{match.standings.data.map(row=><tr key={row.teamId} className={row.highlighted?'is-highlighted':undefined}><td>{row.position}</td><th><Link href={teamPath(locale,row.teamPublicId,row.team)}>{row.team}</Link></th><td>{row.played??'—'}</td><td>{row.won??'—'}</td><td>{row.drawn??'—'}</td><td>{row.lost??'—'}</td><td>{row.goalsFor===null||row.goalsAgainst===null?'—':`${row.goalsFor}:${row.goalsAgainst}`}</td><td><strong>{row.points??'—'}</strong></td></tr>)}</tbody></table></div>:<ModuleState locale={locale} module={match.standings}/>}</section>;
}

// M1 crawl emphasis: these players are already linked once in the lineups above, so an aged-out match
// shows the repeat mention as plain text — no unique link and no visible information is lost.
function PlayerPerformances({locale,match,linkPlayers}:{locale:SiteLocale;match:MatchCenterView;linkPlayers:boolean}){
  const rows=match.playerStatistics.data;
  if(!rows.length)return null;
  return <section id="player-statistics" className="match-panel"><h2>{copy[locale].playerPerformance}</h2><div className="player-performance-grid">{rows.map(row=>{
    const stats=row.statistics.filter(item=>Boolean(playerStatisticLabels[locale][item.code])).slice(0,5);
    return stats.length?<article key={row.playerId}><div>{linkPlayers?<Link href={playerPath(locale,row.playerPublicId,row.player)}>{row.player}</Link>:<span>{row.player}</span>}<small>{row.team}</small></div>
      <p>{stats.map(item=><span key={item.code}><strong>{item.value}</strong> {playerStatisticLabels[locale][item.code]}</span>)}</p></article>:null;
  })}</div></section>;
}

export async function EnglishMatchCenter({ locale, match, replay = false, commercialLocale = 'br', timeZone = resolveTimeZone(locale,null,null) }: { locale: SiteLocale; match: MatchCenterView; replay?: boolean; commercialLocale?: import('@/config/i18n').SiteLocale; timeZone?: string }){
  const text=copy[locale]; const dictionary=getDictionary(locale); const canonical=matchPath(locale,match.header.publicId,match.header.home.name,match.header.away.name);
  const alternate={br:matchPath('br',match.header.publicId,match.header.home.name,match.header.away.name),mx:matchPath('mx',match.header.publicId,match.header.home.name,match.header.away.name)};

  const displayStatus=replay?FixtureStatus.LIVE:match.header.status;
  const scheduled=displayStatus===FixtureStatus.SCHEDULED;
  const decayed=isFinishedMatchDecayed(match.header.status,match.header.kickoff);
  const brPath=brMatchPath('br',match.header.publicId,match.header.home.name,match.header.away.name);
  const banners=commercialLocale==='br'&&!replay;
  return <div lang={dictionary.locale} className="app-shell match-shell english-sports"><SiteHeader locale={locale} activePage="football" localeHrefs={alternate} contentId="match-content"/>
    <main id="match-content" className="match-container"><h1 className="sr-only">{match.header.home.name} × {match.header.away.name}</h1><Link href={localeRoutes[locale].football} className="match-back">← {text.back}</Link>
      {replay?<p className="replay-label">{text.replay}</p>:null}

      {!replay&&match.liveSnapshotStale?<p className="stale-live-label">{text.liveStale}</p>:null}
      <header className="match-hero" data-status={displayStatus}><div className="match-competition"><Link href={competitionPath(locale,match.header.competitionSlug)}>{match.header.competition}</Link><FavoriteButton locale={locale} kind="competition" id={match.header.competitionSlug} className="favorite-toggle-compact"/><FavoriteButton locale={locale} kind="fixture" id={match.header.publicId}/><b>{statusLabel(locale,displayStatus)}</b></div>
        <div className="match-scoreboard"><div className="match-team"><Link href={teamPath(locale,match.header.home.publicId,match.header.home.name)}><TeamIdentity name={match.header.home.name} shortName={match.header.home.shortName} imageUrl={match.header.home.imageUrl} size={80}/></Link><FavoriteButton locale={locale} kind="team" id={match.header.home.publicId} className="favorite-toggle-compact"/></div>
          <div className={`match-score${scheduled?' is-scheduled':''}`}><strong>{scheduled?<LocalizedTimeText value={match.header.kickoff} locale={locale} options={{hour:'2-digit',minute:'2-digit'}} fallbackTimeZone={timeZone}/>:<>{match.header.homeScore??'—'} <span>–</span> {match.header.awayScore??'—'}</>}</strong><time dateTime={match.header.kickoff}><LocalizedTimeText value={match.header.kickoff} locale={locale} options={{dateStyle:'medium',timeStyle:'short'}} fallbackTimeZone={timeZone}/></time><small><MatchTimeZone locale={locale} fallbackTimeZone={timeZone}/></small></div>
          <div className="match-team is-away"><Link href={teamPath(locale,match.header.away.publicId,match.header.away.name)}><TeamIdentity name={match.header.away.name} shortName={match.header.away.shortName} imageUrl={match.header.away.imageUrl} size={80}/></Link><FavoriteButton locale={locale} kind="team" id={match.header.away.publicId} className="favorite-toggle-compact"/></div></div>
        <MatchClientActions canonicalUrl={`https://livasports.com${canonical}`} shareText={`${match.header.home.name} x ${match.header.away.name}`} labels={{share:text.share,copied:text.copied}}/>
      </header>

      <MatchSectionNav className="match-tabs" label="Match sections" items={[{href:'#summary',label:text.summary},{href:'#statistics',label:text.statistics},{href:'#lineups',label:text.lineups},
        ...(match.playerStatistics.data.length?[{href:'#player-statistics',label:text.playerPerformance}]:[]),{href:'#meetings',label:text.meetings},{href:'#standings',label:text.standings},{href:'#odds',label:'Odds'}]}/>
      {banners?<SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPath,placement:'mobile_inline'}}/>:null}
      <div className="match-content-grid"><div className="match-main-column"><Summary locale={locale} match={match}/><Statistics locale={locale} module={match.statistics}/><Lineups locale={locale} match={match}/><PlayerPerformances locale={locale} match={match} linkPlayers={!decayed}/><Form locale={locale} match={match}/><Standings locale={locale} match={match}/>
        {!replay?<PregameOdds uiLocale="en" fixturePublicId={match.header.publicId} initial={match.oddsComparisons??[]} context={{fixtureId:match.header.id,competitionId:match.header.competitionId,locale:commercialLocale}}/>:null}
        <NextMatches locale="en" matches={match.nextMatches} timeZone={timeZone}/></div>
        <aside className="match-context">{banners?<SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPath,placement:'match_right_rail'}}/>:null}<section><h2>{text.summary}</h2><dl><div><dt>{text.season}</dt><dd>{match.header.season??'—'}</dd></div><div><dt>{text.stage}</dt><dd>{sportStage(locale,match.header.stage) ?? '—'}</dd></div><div><dt>{text.venue}</dt><dd>{match.header.venue??'—'}</dd></div></dl></section></aside></div>
      {!replay?<LiveRefreshBoundary publicId={match.header.publicId} locale="br" status={match.header.status} snapshotAt={match.snapshotAt} kickoff={match.header.kickoff} providerUpdatedAt={match.header.providerUpdatedAt}/>:null}
    </main></div>;
}
