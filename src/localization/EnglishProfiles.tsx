import {primaryProfileStatistics} from '@/profiles/statistics';
import {unlinkedTeamLabel} from '@/sports/unlinked-competition';
import {LocalizedTimeText} from '@/localization/LocalizedTime';
import Link from '@/sports/SportsLink';
import {SquadBrowser} from '@/sports/SquadBrowser';
import type {ReactNode} from 'react';
import {competitionPath,sportStage} from '@/sports/policy';
import {SectionNav} from '@/components/sports/SectionNav';
import { SiteHeader } from '@/components/sports/SiteHeader';
import { TeamMark } from '@/components/sports/TeamMark';
import { FixtureStatus } from '@/domain/enums';
import {interfaceDictionary as getDictionary,interfaceRoutes as localeRoutes} from './interface';
type SiteLocale='en';
import {matchPath,playerPath,teamPath} from './interface';
import {englishCountry as localizedCountry,englishPosition as localizedPosition} from './sports-copy';
import {countryCodeFromName} from '@/profiles/localization';
import {countryMarkFromIso} from '@/sports/country-mark';
import {CountryMarkIcon} from '@/components/sports/CountryMarkIcon';
import {FavoriteButton} from '@/favorites/FavoriteButton';

import type { PlayerMatchLog, PlayerProfileView, ProfileFixture, ProfileModule, ProfileStatistic, TeamProfileView } from '@/profiles/types';

import { PlayerAvatar } from '@/components/profile/PlayerAvatar';
import { SponsoredSlot } from '@/components/commercial/SponsoredSlot';
import { teamPath as brTeamPath, playerPath as brPlayerPath } from '@/profiles/routes';


const copy={en:{"back":"Back to football","overview":"Overview","matches":"Matches","standings":"Standings","squad":"Squad","statistics":"Statistics","next":"Next match","recent":"Recent results","competitions":"Current competitions","founded":"Founded","venue":"Stadium","coach":"Coach","noData":"No data is available at the moment.","notIngested":"Details are not yet available for this profile.","notCovered":"This information is not covered by the source.","notApplicable":"This section does not apply to this context.","temporary":"This section is temporarily unavailable.","stale":"Showing the latest saved information.","goalkeepers":"Goalkeepers","defenders":"Defenders","midfielders":"Midfielders","forwards":"Forwards","other":"Other","played":"P","won":"W","drawn":"D","lost":"L","goals":"Goals","points":"Pts","jersey":"Number","seasonContext":"Season / competition","playerOverview":"Overview","playerMatches":"Matches","playerStats":"Statistics","team":"Current team","nationality":"Nationality","position":"Position","birth":"Date of birth","age":"Age","height":"Height","weight":"Weight","years":"years","appearances":"Recent appearances","starter":"Starter","substitute":"Substitute","opponent":"Opponent","unavailable":"Not recorded","minutes":"min","shots":"shots","onTarget":"on target","saves":"saves","rating":"rating"}} as const;
const metricLabels:Record<SiteLocale,Record<string,string>>={en:{"WIN":"Wins","DRAW":"Draws","LOST":"Losses","GOALS":"Goals scored","GOALS_CONCEDED":"Goals conceded","CLEANSHEET":"Clean sheets","YELLOWCARDS":"Yellow cards","REDCARDS":"Red cards","CORNERS":"Corners","BALL_POSSESSION":"Average possession","APPEARANCES":"Appearances","LINEUPS":"Starts","MINUTES_PLAYED":"Minutes","ASSISTS":"Assists","SHOTS":"Shots","SHOTS_ON_TARGET":"Shots on target","SAVES":"Saves","RATING":"Average rating"}};

function initials(name: string) {
  const parts = name.trim().split(/\s+/); return (parts.length > 1 ? [parts[0], parts.at(-1)] : parts).map(item => item?.[0] ?? '').join('').toUpperCase();
}
function State<T>({ locale, module }: { locale: SiteLocale; module: ProfileModule<T> }) {
  const text = copy[locale];
  const label = module.state === 'NOT_YET_INGESTED' ? text.notIngested : module.state === 'NOT_COVERED' ? text.notCovered
    : module.state === 'NOT_APPLICABLE' ? text.notApplicable : module.state === 'ERROR' ? text.temporary : module.state === 'STALE' ? text.stale : text.noData;
  return <p className="profile-empty" role="status">{label}</p>;
}
function Nav({ locale, player = false }: { locale: SiteLocale; player?: boolean }) {
  const text = copy[locale];
  const items = player ? [['#overview',text.playerOverview],['#matches',text.playerMatches],['#statistics',text.playerStats]]
    : [['#overview',text.overview],['#matches',text.matches],['#standings',text.standings],['#squad',text.squad],['#statistics',text.statistics]];
  return <SectionNav className="profile-tabs" label={'Profile sections'} items={items.map(([href,label])=>({href,label}))}/>;
}
async function MatchRow({ locale, row, teamId }: { locale: SiteLocale; row: ProfileFixture; teamId?: string }){
  const dictionary = getDictionary(locale);
  const finished = row.status === FixtureStatus.FINISHED;
  const score = finished && row.homeScore !== null && row.awayScore !== null ? `${row.homeScore}–${row.awayScore}` : dictionary.statuses[row.status];
  const opponent = teamId ? (row.home.id === teamId ? row.away : row.home) : null;
  return <div className="profile-match-row-wrap"><Link href={matchPath(locale,row.publicId,row.home.name,row.away.name)} className="profile-match-row">
    <time dateTime={row.kickoff}><LocalizedTimeText value={row.kickoff} locale={locale} options={{dateStyle:'medium',timeStyle:'short'}}/></time><span className="profile-match-competition">{row.competition}</span>
    <strong>{opponent ? opponent.name : `${row.home.name} × ${row.away.name}`}</strong><b className={finished?'is-finished':undefined}>{score}</b>
  </Link><FavoriteButton locale={locale} kind="fixture" id={row.publicId} className="favorite-toggle-compact"/></div>;
}
function appearanceDetails(locale: SiteLocale, row: PlayerMatchLog): string[] {
  const text=copy[locale]; const parts:string[]=[];
  if(row.starter!==null)parts.push(row.starter?text.starter:text.substitute);
  if(row.minutesPlayed!==null)parts.push(`${row.minutesPlayed} ${text.minutes}`);
  if(row.goals!==null)parts.push(`${row.goals} G`);
  if(row.assists!==null)parts.push(`${row.assists} A`);
  if(row.shots!==null)parts.push(`${row.shots} ${text.shots}`);
  if(row.shotsOnTarget!==null)parts.push(`${row.shotsOnTarget} ${text.onTarget}`);
  if(row.saves!==null)parts.push(`${row.saves} ${text.saves}`);
  if(row.yellowCards!==null)parts.push(`${row.yellowCards} 🟨`);
  if(row.redCards!==null)parts.push(`${row.redCards} 🟥`);
  if(row.rating!==null)parts.push(`${text.rating} ${new Intl.NumberFormat(getDictionary(locale).locale,{maximumFractionDigits:2}).format(row.rating)}`);
  return parts;
}
function Stats({ locale, rows }: { locale: SiteLocale; rows: ProfileStatistic[] }) {
  const groups = new Map<string,ProfileStatistic[]>();
  for(const row of rows){const key=`${row.competitionId}:${row.seasonId}:${row.teamId??row.sourceTeamKey}`;groups.set(key,[...(groups.get(key)??[]),row]);}
  const contexts=[...groups.values()];
  return <>{contexts.length>1?<nav className="profile-context-nav" aria-label={copy[locale].seasonContext}>{contexts.map((group,index)=><a key={`${group[0].competitionId}:${group[0].seasonId}:${group[0].teamId??group[0].sourceTeamKey}`} href={`#profile-stats-${index}`}>{group[0].competition}<small>{group[0].season}</small></a>)}</nav>:null}
  <div className="profile-stat-contexts">{contexts.map((group,index)=><article id={`profile-stats-${index}`} key={`${group[0].competitionId}:${group[0].seasonId}:${group[0].teamId??group[0].sourceTeamKey}`}>
    <header><strong>{group[0].competition}</strong><span>{group[0].season}{` · ${group[0].team??unlinkedTeamLabel(locale)}`}</span></header>
    <div className="profile-stat-grid">{group.map(row=><div key={row.code}><span>{metricLabels[locale][row.code]??row.label}</span><strong>{typeof row.value==='number'?new Intl.NumberFormat(getDictionary(locale).locale,{maximumFractionDigits:2}).format(row.value):row.value}{row.unit??''}</strong></div>)}</div>
  </article>)}</div></>;
}
function TeamHeader({ locale, profile }: { locale: SiteLocale; profile: TeamProfileView }) {
  const text=copy[locale]; const country=localizedCountry(locale,profile.country); const mark=countryMarkFromIso(countryCodeFromName(profile.country),profile.country); const facts=[[profile.foundedYear?`${text.founded} ${profile.foundedYear}`:null,null],
    [profile.venue?`${text.venue}: ${profile.venue}${profile.venueCity?` · ${profile.venueCity}`:''}`:null,null],[profile.coach?`${text.coach}: ${profile.coach}`:null,null]].filter(item=>item[0]);
  return <header className="profile-hero"><TeamMark initials={initials(profile.name)} imageUrl={profile.imageUrl} size={104}/><div><span>{profile.country?<><CountryMarkIcon mark={mark} className="profile-country-mark"/> {country}</>:null}</span><h1>{profile.name}</h1>
    <div className="profile-hero-facts">{facts.map(([value],i)=><small key={`${value}:${i}`}>{value}</small>)}</div></div><FavoriteButton locale={locale} kind="team" id={profile.publicId}/></header>;
}
function Squad({locale,profile}:{locale:SiteLocale;profile:TeamProfileView}){return profile.squad.data.length?<SquadBrowser locale={locale} contexts={profile.squad.data}/>:<State locale={locale} module={profile.squad}/>;}

export function EnglishTeamProfilePage({ locale, profile,history }: { locale: SiteLocale; profile: TeamProfileView;history?:ReactNode }) {
  const text=copy[locale],dictionary=getDictionary(locale); const alternate={br:teamPath('br',profile.publicId,profile.name),mx:teamPath('mx',profile.publicId,profile.name)};
  const currentContexts=profile.competitions.filter(item=>item.isCurrent);
  const visibleContexts=(currentContexts.length?currentContexts:profile.competitions).slice(0,8);
  const recentForm=profile.recent.slice(0,5); const primaryStanding=profile.standings.data[0];
  return <div lang={dictionary.locale} className="app-shell profile-shell english-sports"><SiteHeader locale={locale} activePage="football" localeHrefs={alternate} contentId="profile-content"/>
    <main id="profile-content" className="profile-container"><Link className="profile-back" href={localeRoutes[locale].football}>← {text.back}</Link>
      <TeamHeader locale={locale} profile={profile}/>
      <SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brTeamPath('br',profile.publicId,profile.name),placement:'profile_mobile_inline'}}/>
      <Nav locale={locale}/>
      <div className="profile-layout"><div className="profile-main">
        <section id="overview" className="profile-panel"><h2>{text.overview}</h2><div className="profile-overview-grid"><article><h3>{text.next}</h3>{profile.upcoming[0]?<MatchRow locale={locale} row={profile.upcoming[0]} teamId={profile.id}/>:<p>{text.noData}</p>}</article>
          <article><h3>{text.competitions}</h3><div className="competition-chips">{visibleContexts.map(item=><Link key={item.seasonId} href={competitionPath(locale,item.competitionSlug,{season:item.seasonId})}>{item.competition}<small>{item.season}</small></Link>)}</div></article>
          <article><h3>{text.recent}</h3>{recentForm.length?<div className="profile-form-strip">{recentForm.map(row=>{const mine=row.home.id===profile.id?row.homeScore:row.awayScore;const theirs=row.home.id===profile.id?row.awayScore:row.homeScore;const result=mine===null||theirs===null?'—':mine>theirs?'W':mine<theirs?'L' :'D';return <Link key={row.id} href={matchPath(locale,row.publicId,row.home.name,row.away.name)} title={`${row.home.name} × ${row.away.name}`} data-result={mine===null||theirs===null?'unknown':mine>theirs?'win':mine<theirs?'loss':'draw'}>{result}</Link>;})}</div>:<p>{text.noData}</p>}</article>
          <article><h3>{text.standings}</h3>{primaryStanding?<p className="profile-position"><strong>{primaryStanding.position}</strong><span>{primaryStanding.competition} · {primaryStanding.season}</span></p>:<p>{text.noData}</p>}</article></div></section>
        {history??<section id="matches" className="profile-panel"><h2>{text.matches}</h2>{profile.upcoming.length||profile.recent.length?<div className="profile-match-list">
          {profile.upcoming.slice(0,5).map(row=><MatchRow key={row.id} locale={locale} row={row} teamId={profile.id}/>)}{profile.recent.slice(0,8).map(row=><MatchRow key={row.id} locale={locale} row={row} teamId={profile.id}/>)}</div>:<p className="profile-empty">{text.noData}</p>}</section>}
        <section id="standings" className="profile-panel"><h2>{text.standings}</h2>{profile.standings.data.length?<div className="profile-standing-grid">{profile.standings.data.map((row,i)=><article key={`${row.competition}:${row.season}:${row.stage}:${i}`}><span>{row.competition}<small>{row.season}{sportStage(locale,row.stage)?` · ${sportStage(locale,row.stage)}`:''}</small></span><strong>{row.position}</strong><div><span>{text.played} {row.played??'—'}</span><span>{text.won} {row.won??'—'}</span><span>{text.drawn} {row.drawn??'—'}</span><span>{text.lost} {row.lost??'—'}</span><span>{text.points} {row.points??'—'}</span></div></article>)}</div>:<State locale={locale} module={profile.standings}/>}</section>
        <section id="squad" className="profile-panel"><h2>{text.squad}</h2><Squad locale={locale} profile={profile}/></section>
        <section id="statistics" className="profile-panel"><h2>{text.statistics}</h2>{profile.statistics.data.length?<Stats locale={locale} rows={profile.statistics.data}/>:<State locale={locale} module={profile.statistics}/>}</section>
      </div><aside className="profile-rail"><SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brTeamPath('br',profile.publicId,profile.name),placement:'team_right_rail'}}/><section><h2>{text.competitions}</h2>{visibleContexts.map(item=><div key={item.seasonId}><strong>{item.competition}</strong><span>{item.season}</span></div>)}</section></aside></div>
    </main></div>;
}

function birthDate(value:string){const normalized=/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T00:00:00Z`:value;const date=new Date(normalized);return Number.isNaN(date.getTime())?null:date;}
function age(dateOfBirth:string){const birth=birthDate(dateOfBirth);if(!birth)return null;const today=new Date();let years=today.getUTCFullYear()-birth.getUTCFullYear();
  if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))years--;return years;}

export async function EnglishPlayerProfilePage({ locale, profile }: { locale: SiteLocale; profile: PlayerProfileView }){
  const text=copy[locale],dictionary=getDictionary(locale); const alternate={br:playerPath('br',profile.publicId,profile.name),mx:playerPath('mx',profile.publicId,profile.name)};
  const parsedBirth=profile.dateOfBirth?birthDate(profile.dateOfBirth):null,playerAge=profile.dateOfBirth?age(profile.dateOfBirth):null;
  const position=localizedPosition(locale,profile.detailedPosition,profile.position);
  const nationalityName=profile.nationality??profile.country,nationalityMark=countryMarkFromIso(countryCodeFromName(nationalityName),nationalityName);
  const facts=[[text.nationality,localizedCountry(locale,profile.nationality??profile.country)],[text.position,position],
    [text.birth,parsedBirth?new Intl.DateTimeFormat(dictionary.locale,{dateStyle:'medium',timeZone:'UTC'}).format(parsedBirth):null],
    [text.age,playerAge===null?null:`${playerAge} ${text.years}`],[text.height,profile.heightCm?`${profile.heightCm} cm`:null],[text.weight,profile.weightKg?`${profile.weightKg} kg`:null]].filter(([,value])=>value);
  const overviewStats=primaryProfileStatistics(profile.statistics.data),recentAppearance=profile.matches.data[0];
  return <div lang={dictionary.locale} className="app-shell profile-shell english-sports"><SiteHeader locale={locale} activePage="football" localeHrefs={alternate} contentId="profile-content"/>
    <main id="profile-content" className="profile-container"><Link className="profile-back" href={profile.currentTeam?teamPath(locale,profile.currentTeam.publicId,profile.currentTeam.name):localeRoutes[locale].football}>← {profile.currentTeam?'Back to team':text.back}</Link>
      <header className="profile-hero player-profile-hero"><PlayerAvatar name={profile.name} imageUrl={profile.imageUrl} large/><div><span>{nationalityName?<><CountryMarkIcon mark={nationalityMark} decorative={false} className="profile-country-mark"/> {localizedCountry(locale,nationalityName)}</>:position??''}</span><h1>{profile.name}</h1>
        {profile.currentTeam?<Link className="profile-team-link" href={teamPath(locale,profile.currentTeam.publicId,profile.currentTeam.name)}><TeamMark initials={initials(profile.currentTeam.name)} imageUrl={profile.currentTeam.imageUrl}/>{profile.currentTeam.name}</Link>:null}</div></header>
      <SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPlayerPath('br',profile.publicId,profile.name),placement:'profile_mobile_inline'}}/>
      <Nav locale={locale} player/><div className="profile-layout"><div className="profile-main">
        <section id="overview" className="profile-panel"><h2>{text.playerOverview}</h2><dl className="player-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {profile.contexts.length?<div className="competition-chips">{profile.contexts.slice(0,8).map(item=><span key={`${item.teamId}:${item.seasonId}`}><Link href={teamPath(locale,item.teamPublicId,item.team)}>{item.team}</Link><small>{item.competition} · {item.season}</small></span>)}</div>:null}
          {overviewStats.length?<><p className="sports-data-note">{overviewStats[0].competition} · {overviewStats[0].season} · {overviewStats[0].team??unlinkedTeamLabel(locale)}</p><div className="profile-stat-grid profile-key-stats">{overviewStats.map(row=><div key={`${row.teamId??row.sourceTeamKey}:${row.seasonId}:${row.code}`}><span>{metricLabels[locale][row.code]??row.label}</span><strong>{typeof row.value==='number'?new Intl.NumberFormat(getDictionary(locale).locale,{maximumFractionDigits:2}).format(row.value):row.value}{row.unit??''}</strong></div>)}</div></>:null}
          {recentAppearance?<Link className="profile-latest-appearance" href={matchPath(locale,recentAppearance.publicId,recentAppearance.home.name,recentAppearance.away.name)}><span>{text.appearances}</span><strong>{recentAppearance.opponent}</strong><small>{appearanceDetails(locale,recentAppearance).join(' · ')}</small></Link>:null}</section>
        <section id="matches" className="profile-panel"><h2>{text.appearances}</h2>{profile.matches.data.length?<div className="profile-match-list">{profile.matches.data.map(row=><Link key={row.id} href={matchPath(locale,row.publicId,row.home.name,row.away.name)} className="profile-match-row player-match-row"><time dateTime={row.kickoff}><LocalizedTimeText value={row.kickoff} locale={locale} options={{dateStyle:'short'}}/></time><span>{row.competition}</span><strong>{row.opponent}</strong><b>{row.homeScore===null||row.awayScore===null?dictionary.statuses[row.status]:`${row.homeScore}–${row.awayScore}`}</b><small>{appearanceDetails(locale,row).join(' · ')}</small></Link>)}</div>:<State locale={locale} module={profile.matches}/>}</section>
        <section id="statistics" className="profile-panel"><h2>{text.playerStats}</h2>{profile.statistics.data.length?<Stats locale={locale} rows={profile.statistics.data}/>:<State locale={locale} module={profile.statistics}/>}</section>
      </div><aside className="profile-rail"><SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPlayerPath('br',profile.publicId,profile.name),placement:'player_right_rail'}}/><section><h2>{text.playerOverview}</h2>{facts.map(([label,value])=><div key={label}><strong>{label}</strong><span>{value}</span></div>)}</section></aside></div>
    </main></div>;
}
