import Link from 'next/link';
import { SiteHeader } from '@/components/sports/SiteHeader';
import { TeamMark } from '@/components/sports/TeamMark';
import { FixtureStatus } from '@/domain/enums';
import { getDictionary, localeRoutes, type SiteLocale } from '@/config/i18n';
import { matchPath } from '@/match-center/routes';
import { localizedCountry, localizedPosition } from '@/profiles/localization';
import { playerPath, teamPath } from '@/profiles/routes';
import type { PlayerMatchLog, PlayerProfileView, ProfileFixture, ProfileModule, ProfileStatistic, SquadPlayer, TeamProfileView } from '@/profiles/types';
import { SponsoredSlot } from './SponsoredSlot';
import { PlayerAvatar } from './PlayerAvatar';

const copy = {
  br: {
    back: 'Voltar ao futebol', overview: 'Visão geral', matches: 'Partidas', standings: 'Classificação', squad: 'Elenco', statistics: 'Estatísticas',
    next: 'Próximo jogo', recent: 'Últimos resultados', competitions: 'Competições atuais', founded: 'Fundado em', venue: 'Estádio', coach: 'Técnico',
    noData: 'Sem dados disponíveis neste momento.', notIngested: 'Dados ainda não ingeridos para este perfil.', notCovered: 'Este dado não está coberto pelo provedor.',
    notApplicable: 'Este módulo não se aplica a este contexto.', temporary: 'Este módulo está temporariamente indisponível.', stale: 'Últimos dados persistidos disponíveis.',
    goalkeepers: 'Goleiros', defenders: 'Defensores', midfielders: 'Meio-campistas', forwards: 'Atacantes', other: 'Outros',
    played: 'J', won: 'V', drawn: 'E', lost: 'D', goals: 'Gols', points: 'Pts', jersey: 'Camisa', seasonContext: 'Temporada / competição',
    playerOverview: 'Visão geral', playerMatches: 'Partidas', playerStats: 'Estatísticas', team: 'Time atual', nationality: 'Nacionalidade',
    position: 'Posição', birth: 'Nascimento', age: 'Idade', height: 'Altura', weight: 'Peso', years: 'anos', appearances: 'Aparições recentes',
    starter: 'Titular', substitute: 'Reserva', opponent: 'Adversário', unavailable: 'Não informado', sponsor: 'Publicidade',
    minutes: 'min', shots: 'finalizações', onTarget: 'no gol', saves: 'defesas', rating: 'nota',
  },
  mx: {
    back: 'Volver al fútbol', overview: 'Resumen', matches: 'Partidos', standings: 'Clasificación', squad: 'Plantilla', statistics: 'Estadísticas',
    next: 'Próximo partido', recent: 'Últimos resultados', competitions: 'Competiciones actuales', founded: 'Fundado en', venue: 'Estadio', coach: 'Entrenador',
    noData: 'No hay datos disponibles en este momento.', notIngested: 'Los datos aún no se han incorporado para este perfil.', notCovered: 'Este dato no está cubierto por el proveedor.',
    notApplicable: 'Este módulo no corresponde a este contexto.', temporary: 'Este módulo no está disponible temporalmente.', stale: 'Últimos datos guardados disponibles.',
    goalkeepers: 'Porteros', defenders: 'Defensas', midfielders: 'Mediocampistas', forwards: 'Delanteros', other: 'Otros',
    played: 'PJ', won: 'G', drawn: 'E', lost: 'P', goals: 'Goles', points: 'Pts', jersey: 'Dorsal', seasonContext: 'Temporada / competición',
    playerOverview: 'Resumen', playerMatches: 'Partidos', playerStats: 'Estadísticas', team: 'Equipo actual', nationality: 'Nacionalidad',
    position: 'Posición', birth: 'Nacimiento', age: 'Edad', height: 'Altura', weight: 'Peso', years: 'años', appearances: 'Apariciones recientes',
    starter: 'Titular', substitute: 'Suplente', opponent: 'Rival', unavailable: 'No informado', sponsor: 'Publicidad',
    minutes: 'min', shots: 'tiros', onTarget: 'a puerta', saves: 'atajadas', rating: 'nota',
  },
} as const;

const metricLabels: Record<SiteLocale, Record<string, string>> = {
  br: { WIN:'Vitórias',DRAW:'Empates',LOST:'Derrotas',GOALS:'Gols marcados',GOALS_CONCEDED:'Gols sofridos',CLEANSHEET:'Jogos sem sofrer gol',
    YELLOWCARDS:'Cartões amarelos',REDCARDS:'Cartões vermelhos',CORNERS:'Escanteios',BALL_POSSESSION:'Posse média',APPEARANCES:'Jogos',LINEUPS:'Titularidades',
    MINUTES_PLAYED:'Minutos',ASSISTS:'Assistências',SHOTS:'Finalizações',SHOTS_ON_TARGET:'Finalizações no gol',SAVES:'Defesas',RATING:'Nota média' },
  mx: { WIN:'Victorias',DRAW:'Empates',LOST:'Derrotas',GOALS:'Goles anotados',GOALS_CONCEDED:'Goles recibidos',CLEANSHEET:'Porterías a cero',
    YELLOWCARDS:'Tarjetas amarillas',REDCARDS:'Tarjetas rojas',CORNERS:'Tiros de esquina',BALL_POSSESSION:'Posesión media',APPEARANCES:'Partidos',LINEUPS:'Titularidades',
    MINUTES_PLAYED:'Minutos',ASSISTS:'Asistencias',SHOTS:'Tiros',SHOTS_ON_TARGET:'Tiros a puerta',SAVES:'Atajadas',RATING:'Calificación media' },
};

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
  return <nav className="profile-tabs" aria-label={locale === 'br' ? 'Seções do perfil' : 'Secciones del perfil'}>{items.map(([href,label])=><a key={href} href={href}>{label}</a>)}</nav>;
}
function MatchRow({ locale, row, teamId }: { locale: SiteLocale; row: ProfileFixture; teamId?: string }) {
  const dictionary = getDictionary(locale); const date = new Intl.DateTimeFormat(dictionary.locale,{dateStyle:'medium',timeStyle:'short',timeZone:dictionary.timeZone}).format(new Date(row.kickoff));
  const finished = row.status === FixtureStatus.FINISHED;
  const score = finished && row.homeScore !== null && row.awayScore !== null ? `${row.homeScore}–${row.awayScore}` : dictionary.statuses[row.status];
  const opponent = teamId ? (row.home.id === teamId ? row.away : row.home) : null;
  return <Link href={matchPath(locale,row.publicId,row.home.name,row.away.name)} className="profile-match-row">
    <time dateTime={row.kickoff}>{date}</time><span className="profile-match-competition">{row.competition}</span>
    <strong>{opponent ? opponent.name : `${row.home.name} × ${row.away.name}`}</strong><b className={finished?'is-finished':undefined}>{score}</b>
  </Link>;
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
  for(const row of rows){const key=`${row.competitionId}:${row.seasonId}:${row.teamId}`;groups.set(key,[...(groups.get(key)??[]),row]);}
  const contexts=[...groups.values()];
  return <>{contexts.length>1?<nav className="profile-context-nav" aria-label={copy[locale].seasonContext}>{contexts.map((group,index)=><a key={`${group[0].competitionId}:${group[0].seasonId}:${group[0].teamId}`} href={`#profile-stats-${index}`}>{group[0].competition}<small>{group[0].season}</small></a>)}</nav>:null}
  <div className="profile-stat-contexts">{contexts.map((group,index)=><article id={`profile-stats-${index}`} key={`${group[0].competitionId}:${group[0].seasonId}:${group[0].teamId}`}>
    <header><strong>{group[0].competition}</strong><span>{group[0].season}{group[0].team?` · ${group[0].team}`:''}</span></header>
    <div className="profile-stat-grid">{group.map(row=><div key={row.code}><span>{metricLabels[locale][row.code]??row.label}</span><strong>{typeof row.value==='number'?new Intl.NumberFormat(getDictionary(locale).locale,{maximumFractionDigits:2}).format(row.value):row.value}{row.unit??''}</strong></div>)}</div>
  </article>)}</div></>;
}
function TeamHeader({ locale, profile }: { locale: SiteLocale; profile: TeamProfileView }) {
  const text=copy[locale]; const country=localizedCountry(locale,profile.country); const facts=[[profile.foundedYear?`${text.founded} ${profile.foundedYear}`:null,null],
    [profile.venue?`${text.venue}: ${profile.venue}${profile.venueCity?` · ${profile.venueCity}`:''}`:null,null],[profile.coach?`${text.coach}: ${profile.coach}`:null,null]].filter(item=>item[0]);
  return <header className="profile-hero"><TeamMark initials={initials(profile.name)} imageUrl={profile.imageUrl}/><div><span>{country??''}</span><h1>{profile.name}</h1>
    <div className="profile-hero-facts">{facts.map(([value],i)=><small key={`${value}:${i}`}>{value}</small>)}</div></div></header>;
}
function Squad({ locale, profile }: { locale: SiteLocale; profile: TeamProfileView }) {
  const text=copy[locale]; const selected=profile.squad.data[0]; if(!selected)return <State locale={locale} module={profile.squad}/>;
  const groups:[string,(row:SquadPlayer)=>boolean][]=[[text.goalkeepers,row=>row.positionId===24],[text.defenders,row=>row.positionId===25],
    [text.midfielders,row=>row.positionId===26],[text.forwards,row=>row.positionId===27],[text.other,row=>![24,25,26,27].includes(row.positionId??-1)]];
  return <><p className="profile-context-label">{selected.competition} · {selected.season}</p><div className="squad-groups">{groups.map(([label,filter])=>{
    const rows=selected.players.filter(filter);return rows.length?<section key={label}><h3>{label}</h3><div className="squad-grid">{rows.map(player=><Link key={player.id} href={playerPath(locale,player.publicId,player.name)} className="squad-card">
      <PlayerAvatar name={player.name} imageUrl={player.imageUrl}/>
      <span><strong>{player.name}</strong><small>{localizedPosition(locale,player.position)??label}{player.jerseyNumber!==null?` · ${text.jersey} ${player.jerseyNumber}`:''}</small></span></Link>)}</div></section>:null;})}</div></>;
}

export function TeamProfilePage({ locale, profile }: { locale: SiteLocale; profile: TeamProfileView }) {
  const text=copy[locale],dictionary=getDictionary(locale); const alternate={br:teamPath('br',profile.publicId,profile.name),mx:teamPath('mx',profile.publicId,profile.name)};
  const currentContexts=profile.competitions.filter(item=>item.isCurrent);
  const visibleContexts=(currentContexts.length?currentContexts:profile.competitions).slice(0,8);
  const recentForm=profile.recent.slice(0,5); const primaryStanding=profile.standings.data[0];
  return <div lang={dictionary.locale} className="app-shell profile-shell"><SiteHeader locale={locale} activePage="football" localeHrefs={alternate} contentId="profile-content"/>
    <main id="profile-content" className="profile-container"><Link className="profile-back" href={localeRoutes[locale].football}>← {text.back}</Link>
      <TeamHeader locale={locale} profile={profile}/><SponsoredSlot campaign={null}/><Nav locale={locale}/>
      <div className="profile-layout"><div className="profile-main">
        <section id="overview" className="profile-panel"><h2>{text.overview}</h2><div className="profile-overview-grid"><article><h3>{text.next}</h3>{profile.upcoming[0]?<MatchRow locale={locale} row={profile.upcoming[0]} teamId={profile.id}/>:<p>{text.noData}</p>}</article>
          <article><h3>{text.competitions}</h3><div className="competition-chips">{visibleContexts.map(item=><span key={item.seasonId}>{item.competition}<small>{item.season}</small></span>)}</div></article>
          <article><h3>{text.recent}</h3>{recentForm.length?<div className="profile-form-strip">{recentForm.map(row=>{const mine=row.home.id===profile.id?row.homeScore:row.awayScore;const theirs=row.home.id===profile.id?row.awayScore:row.homeScore;const result=mine===null||theirs===null?'—':mine>theirs?(locale==='br'?'V':'G'):mine<theirs?(locale==='br'?'D':'P'):'E';return <Link key={row.id} href={matchPath(locale,row.publicId,row.home.name,row.away.name)} title={`${row.home.name} × ${row.away.name}`}>{result}</Link>;})}</div>:<p>{text.noData}</p>}</article>
          <article><h3>{text.standings}</h3>{primaryStanding?<p className="profile-position"><strong>{primaryStanding.position}º</strong><span>{primaryStanding.competition} · {primaryStanding.season}</span></p>:<p>{text.noData}</p>}</article></div></section>
        <section id="matches" className="profile-panel"><h2>{text.matches}</h2>{profile.upcoming.length||profile.recent.length?<div className="profile-match-list">
          {profile.upcoming.slice(0,5).map(row=><MatchRow key={row.id} locale={locale} row={row} teamId={profile.id}/>)}{profile.recent.slice(0,8).map(row=><MatchRow key={row.id} locale={locale} row={row} teamId={profile.id}/>)}</div>:<p className="profile-empty">{text.noData}</p>}</section>
        <section id="standings" className="profile-panel"><h2>{text.standings}</h2>{profile.standings.data.length?<div className="profile-standing-grid">{profile.standings.data.map((row,i)=><article key={`${row.competition}:${row.season}:${row.stage}:${i}`}><span>{row.competition}<small>{row.season}{row.stage?` · ${row.stage}`:''}</small></span><strong>{row.position}º</strong><div><span>{text.played} {row.played??'—'}</span><span>{text.won} {row.won??'—'}</span><span>{text.drawn} {row.drawn??'—'}</span><span>{text.lost} {row.lost??'—'}</span><span>{text.points} {row.points??'—'}</span></div></article>)}</div>:<State locale={locale} module={profile.standings}/>}</section>
        <section id="squad" className="profile-panel"><h2>{text.squad}</h2><Squad locale={locale} profile={profile}/></section>
        <section id="statistics" className="profile-panel"><h2>{text.statistics}</h2>{profile.statistics.data.length?<Stats locale={locale} rows={profile.statistics.data}/>:<State locale={locale} module={profile.statistics}/>}</section>
      </div><aside className="profile-rail"><section><h2>{text.competitions}</h2>{visibleContexts.map(item=><div key={item.seasonId}><strong>{item.competition}</strong><span>{item.season}</span></div>)}</section><SponsoredSlot campaign={null}/></aside></div>
    </main></div>;
}

function birthDate(value:string){const normalized=/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T00:00:00Z`:value;const date=new Date(normalized);return Number.isNaN(date.getTime())?null:date;}
function age(dateOfBirth:string){const birth=birthDate(dateOfBirth);if(!birth)return null;const today=new Date();let years=today.getUTCFullYear()-birth.getUTCFullYear();
  if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))years--;return years;}

export function PlayerProfilePage({ locale, profile }: { locale: SiteLocale; profile: PlayerProfileView }) {
  const text=copy[locale],dictionary=getDictionary(locale); const alternate={br:playerPath('br',profile.publicId,profile.name),mx:playerPath('mx',profile.publicId,profile.name)};
  const parsedBirth=profile.dateOfBirth?birthDate(profile.dateOfBirth):null,playerAge=profile.dateOfBirth?age(profile.dateOfBirth):null;
  const position=localizedPosition(locale,profile.detailedPosition,profile.position);
  const facts=[[text.nationality,localizedCountry(locale,profile.nationality??profile.country)],[text.position,position],
    [text.birth,parsedBirth?new Intl.DateTimeFormat(dictionary.locale,{dateStyle:'medium',timeZone:'UTC'}).format(parsedBirth):null],
    [text.age,playerAge===null?null:`${playerAge} ${text.years}`],[text.height,profile.heightCm?`${profile.heightCm} cm`:null],[text.weight,profile.weightKg?`${profile.weightKg} kg`:null]].filter(([,value])=>value);
  const overviewStats=profile.statistics.data.slice(0,4),recentAppearance=profile.matches.data[0];
  return <div lang={dictionary.locale} className="app-shell profile-shell"><SiteHeader locale={locale} activePage="football" localeHrefs={alternate} contentId="profile-content"/>
    <main id="profile-content" className="profile-container"><Link className="profile-back" href={profile.currentTeam?teamPath(locale,profile.currentTeam.publicId,profile.currentTeam.name):localeRoutes[locale].football}>← {text.back}</Link>
      <header className="profile-hero player-profile-hero"><PlayerAvatar name={profile.name} imageUrl={profile.imageUrl} large/><div><span>{position??''}</span><h1>{profile.name}</h1>
        {profile.currentTeam?<Link className="profile-team-link" href={teamPath(locale,profile.currentTeam.publicId,profile.currentTeam.name)}><TeamMark initials={initials(profile.currentTeam.name)} imageUrl={profile.currentTeam.imageUrl}/>{profile.currentTeam.name}</Link>:null}</div></header>
      <SponsoredSlot campaign={null}/><Nav locale={locale} player/><div className="profile-layout"><div className="profile-main">
        <section id="overview" className="profile-panel"><h2>{text.playerOverview}</h2><dl className="player-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {profile.contexts.length?<div className="competition-chips">{profile.contexts.slice(0,8).map(item=><span key={`${item.teamId}:${item.seasonId}`}><Link href={teamPath(locale,item.teamPublicId,item.team)}>{item.team}</Link><small>{item.competition} · {item.season}</small></span>)}</div>:null}
          {overviewStats.length?<div className="profile-stat-grid profile-key-stats">{overviewStats.map(row=><div key={`${row.teamId}:${row.seasonId}:${row.code}`}><span>{metricLabels[locale][row.code]??row.label}</span><strong>{row.value}{row.unit??''}</strong></div>)}</div>:null}
          {recentAppearance?<Link className="profile-latest-appearance" href={matchPath(locale,recentAppearance.publicId,recentAppearance.home.name,recentAppearance.away.name)}><span>{text.appearances}</span><strong>{recentAppearance.opponent}</strong><small>{appearanceDetails(locale,recentAppearance).join(' · ')}</small></Link>:null}</section>
        <section id="matches" className="profile-panel"><h2>{text.appearances}</h2>{profile.matches.data.length?<div className="profile-match-list">{profile.matches.data.map(row=><Link key={row.id} href={matchPath(locale,row.publicId,row.home.name,row.away.name)} className="profile-match-row player-match-row"><time>{new Intl.DateTimeFormat(dictionary.locale,{dateStyle:'short',timeZone:dictionary.timeZone}).format(new Date(row.kickoff))}</time><span>{row.competition}</span><strong>{row.opponent}</strong><b>{row.homeScore===null||row.awayScore===null?dictionary.statuses[row.status]:`${row.homeScore}–${row.awayScore}`}</b><small>{appearanceDetails(locale,row).join(' · ')}</small></Link>)}</div>:<State locale={locale} module={profile.matches}/>}</section>
        <section id="statistics" className="profile-panel"><h2>{text.playerStats}</h2>{profile.statistics.data.length?<Stats locale={locale} rows={profile.statistics.data}/>:<State locale={locale} module={profile.statistics}/>}</section>
      </div><aside className="profile-rail"><section><h2>{text.playerOverview}</h2>{facts.map(([label,value])=><div key={label}><strong>{label}</strong><span>{value}</span></div>)}</section><SponsoredSlot campaign={null}/></aside></div>
    </main></div>;
}
