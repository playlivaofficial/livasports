import Link from '@/sports/SportsLink';
import {connection} from 'next/server';
import {headers} from 'next/headers';
import {type PageKey} from '@/config/i18n';
import {requestTimeZone} from '@/localization/time-zone-server';
import {interfaceDictionary,interfaceRoutes,matchPath,type InterfaceLocale} from '@/localization/interface';
import {englishSportsData} from '@/localization/sports-copy';
import {loadM3PageData} from '@/delivery/runtime';
import {localDateKey} from '@/delivery/time';
import {commercialLocale,requestCommercialGeo} from '@/odds/commercial-geo';
import {SponsoredSlot} from '@/components/commercial/SponsoredSlot';
import {TeamIdentity,ScoreDisplay} from './FixtureCard';
import {OddsComparison} from './OddsComparison';
import {SiteHeader} from './SiteHeader';
import {boardDate,boardView,boardSort,hasPregameOddsLayout,matchesView,type BoardQuery,type BoardView} from './board-policy';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {CompetitionPanel} from '@/sports/CompetitionPanel';
import {SportsSearch} from '@/sports/Search';
import {loadCompetition,loadCompetitionNav,loadSportsCalendar,loadRedCards} from '@/sports/runtime';
import {RedCardCount} from '@/sports/RedCardCount';
import {competitionTab,sportsPage,sportsSeason} from '@/sports/policy';
import {sportsCopy} from '@/sports/copy';
import {BoardRefresh} from '@/sports/BoardRefresh';
import {CompetitionNav} from './CompetitionNav';
import {competitionMark} from '@/sports/country-mark';
import {CountryMarkIcon} from './CountryMarkIcon';
import {FavoriteButton} from '@/favorites/FavoriteButton';
import {notFound} from 'next/navigation';
import {JsonLd} from '@/seo/json-ld';
import {competitionHubSchema,siteSchema} from '@/seo/structured-data';

const copy={
  br:{all:'Todos',live:'Ao vivo',upcoming:'Próximos',results:'Resultados',today:'Hoje',calendar:'Data dos jogos',go:'Ver',previous:'Dia anterior',next:'Dia seguinte',period:'Próximos 7 dias',competitions:'Competições',allCompetitions:'Todas as competições',empty:'Nenhum jogo neste filtro.',other:'Ver próximos jogos',odds:'Odds 1 X 2',pending:'Aguardando placar',fresh:'Últimos placares salvos',delayed:'Atualizações atrasadas',unavailable:'Atualizações indisponíveis',matches:'jogos',intro:'Placares, próximos jogos e comparação de odds — monte seu bilhete em um só lugar.'},
  mx:{all:'Todos',live:'En vivo',upcoming:'Próximos',results:'Resultados',today:'Hoy',calendar:'Fecha de partidos',go:'Ver',previous:'Día anterior',next:'Día siguiente',period:'Próximos 7 días',competitions:'Competiciones',allCompetitions:'Todas las competiciones',empty:'No hay partidos con este filtro.',other:'Ver próximos partidos',odds:'Cuotas 1 X 2',pending:'Esperando marcador',fresh:'Últimos marcadores guardados',delayed:'Actualizaciones retrasadas',unavailable:'Actualizaciones no disponibles',matches:'partidos',intro:'Marcadores, próximos partidos y comparación de cuotas — arma tu boleto en un solo lugar.'},
  en:{all:'All',live:'Live',upcoming:'Upcoming',results:'Results',today:'Today',calendar:'Match date',go:'Go',previous:'Previous day',next:'Next day',period:'Next 7 days',competitions:'Competitions',allCompetitions:'All competitions',empty:'No matches for this filter.',other:'View upcoming matches',odds:'Odds 1 X 2',pending:'Awaiting score',fresh:'Latest saved scores',delayed:'Updates delayed',unavailable:'Updates unavailable',matches:'matches',intro:'Scores, upcoming matches and odds comparison — build your slip in one place.'}
};


export async function SportsBoardPage({locale,page,searchParams}:{locale:InterfaceLocale;page:PageKey;searchParams?:Promise<BoardQuery>}) {
  await connection();
  const now=new Date(),query=await searchParams??{},text=copy[locale],dictionary=interfaceDictionary(locale);
  const timeZone=await requestTimeZone(locale);
  const today=localDateKey(now,timeZone),calendarBounds=await loadSportsCalendar(locale,timeZone).catch(()=>({from:today,to:today})),date=boardDate(query.date,today,calendarBounds);
  const view=page==='live'?'live':boardView(query.view,page==='home'?'upcoming':'all');
  const base=interfaceRoutes[locale][page];
  const requestedCompetition=typeof query.competition==='string'&&FOOTBALL_COMPETITION_TARGETS.some(t=>t.slug===query.competition)?query.competition:undefined;
  // A competition slug outside the registry is not a filter to ignore: it is an unknown entity (real 404, no soft-404 listing).
  if(page==='football'&&typeof query.competition==='string'&&query.competition!==''&&!requestedCompetition)notFound();
  const tab=competitionTab(query.tab),season=sportsSeason(query.season);
  const hub=page==='football'&&requestedCompetition?await loadCompetition(requestedCompetition,locale,season,sportsPage(query.p)).catch(()=>null):null;
  const showListing=!hub;
  const raw=hub?null:await loadM3PageData(locale==='en'?'br':locale,page,date,timeZone,requestedCompetition);
  const data=raw?(locale==='en'?englishSportsData(raw):raw):null;
  const competition=typeof query.competition==='string'&&data?.sections.some(s=>s.slug===query.competition)?query.competition:undefined;
  const selectedCompetition=data?.sections.find(s=>s.slug===competition);
  const period=competition||hub?(locale==='br'?'Agenda da competição':locale==='mx'?'Calendario de la competición':'Competition schedule'):text.period;
  const allFixtures=data?data.sections.filter(s=>!competition||s.slug===competition).flatMap(s=>s.fixtures):[];
  const redCards=showListing?await loadRedCards(allFixtures.filter(f=>f.status!=='SCHEDULED').map(f=>f.id)).catch(()=>({} as Record<string,{home:number|null;away:number|null}>)):{};
  const sections=data?data.sections.filter(s=>!competition||s.slug===competition).map(s=>({...s,fixtures:s.fixtures.filter(f=>matchesView(f,view,now.getTime())).sort((a,b)=>boardSort(a,b,now.getTime()))})).filter(s=>s.fixtures.length):[];
  const navItems=await loadCompetitionNav(locale,timeZone).catch(()=>[]);
  const freshness=data?.sportsData.freshness??'fresh';
  const href=(changes:{date?:string|null;view?:BoardView;competition?:string|null},path:string=base)=>{
    const params=new URLSearchParams();const d=changes.date===null?undefined:changes.date??date;
    const c=changes.competition===null?undefined:changes.competition??competition;
    const v=changes.view??view;if(d)params.set('date',d);if(c)params.set('competition',c);if(v!=='all')params.set('view',v);
    return path+(params.size?'?'+params:'');
  };
  const shift=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const activeDate=date??(page==='football'?undefined:today),calendarDate=date??today;
  const commercial=commercialLocale(requestCommercialGeo(await headers()));
  const sponsorLocale=locale==='en'?'br':locale;
  const sponsorPath=interfaceRoutes[sponsorLocale][page];
  const sponsors=locale!=='en'||commercial==='br';
  const sponsor=(placement:'home_top_banner'|'mobile_inline'|'home_right_rail')=>sponsors?<SponsoredSlot copyLocale={locale} context={{locale:sponsorLocale,pagePath:sponsorPath,placement}}/>:null;
  return <div lang={dictionary.locale} className={`app-shell sports-board ${locale==='en'?'english-sports':''}`}>
    {page==='home'?<JsonLd data={siteSchema(locale)}/>:hub?<JsonLd data={competitionHubSchema(locale,hub,tab)}/>:null}
    <SiteHeader locale={locale} activePage={page}/>
    <BoardRefresh live={allFixtures.some(f=>f.status==='LIVE'||f.status==='HALFTIME')}/>
    <main id="fixtures-content" className="page-container" data-board-view={view} data-time-zone={timeZone}>
      {sponsor('home_top_banner')}
      <header className="board-heading"><div><span className="board-eyebrow">{locale==='br'?'FUTEBOL':locale==='mx'?'FÚTBOL':'FOOTBALL'}</span><h1>{hub?.name??selectedCompetition?.competition??dictionary.pages[page].title}</h1>{!hub&&!selectedCompetition?<p>{text.intro}</p>:null}</div>
        <span className={`freshness is-${freshness}`}><span className="freshness-dot"/>{freshness==='fresh'?text.fresh:freshness==='stale'?text.delayed:text.unavailable}</span>
      </header>
      <SportsSearch locale={locale} query={query.q}/>
      {sponsor('mobile_inline')}
      <div className="sports-layout">
        <aside className="context-rail"><CompetitionNav locale={locale} title={text.competitions} allHref={href({competition:null})} allLabel={text.allCompetitions} activeSlug={requestedCompetition??competition} items={navItems}/></aside>
        <div className="fixture-content">
          {hub?<CompetitionPanel hub={hub} locale={locale} tab={tab}/>:requestedCompetition&&page==='football'?<p className="sports-empty" role="status">{sportsCopy[locale].unavailable}</p>:null}
          {showListing?<>
          <div className="board-toolbar">
            <nav className="board-filters" aria-label={text.all}>{(['all','live','upcoming','results'] as const).map(v=><Link key={v} className={v==='live'?'filter-live':''} href={href({view:v},page==='live'?interfaceRoutes[locale].football:base)} aria-current={view===v?'page':undefined}>{text[v]}<b>{allFixtures.filter(f=>matchesView(f,v,now.getTime())).length}</b></Link>)}</nav>
            <div className="board-calendar">
              {calendarDate>calendarBounds.from?<Link aria-label={text.previous} href={href({date:shift(calendarDate,-1)})}>‹</Link>:<span aria-label={text.previous} aria-disabled="true">‹</span>}
              <form action={base}><label className="sr-only" htmlFor="match-date">{text.calendar}</label><input id="match-date" name="date" type="date" defaultValue={calendarDate} min={calendarBounds.from} max={calendarBounds.to}/>{competition?<input type="hidden" name="competition" value={competition}/>:null}{view!=='all'?<input type="hidden" name="view" value={view}/>:null}<button type="submit">{text.go}</button></form>
              {calendarDate<calendarBounds.to?<Link aria-label={text.next} href={href({date:shift(calendarDate,1)})}>›</Link>:<span aria-label={text.next} aria-disabled="true">›</span>}
            </div>
          </div>
          <nav className="board-days" aria-label={text.calendar}>
            <Link href={href({date:null},interfaceRoutes[locale].football)} aria-current={!activeDate?'date':undefined}>{period}</Link>
            {[-1,0,1,2,3].map(n=>{const d=shift(today,n);return d<calendarBounds.from||d>calendarBounds.to?null:<Link key={d} href={href({date:d})} aria-current={activeDate===d?'date':undefined}>{n===0?text.today:new Intl.DateTimeFormat(dictionary.locale,{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'))}</Link>;})}
          </nav>
          <p className="board-timezone">{timeZone.replaceAll('_',' ')} · {date??(page==='football'?period:today)}</p>
          {data?.sportsData.state==='unavailable'?<p className="provider-notice" role="status">{text.unavailable}</p>:null}
          {!sections.length?<div className="board-empty" role="status"><p>{text.empty}</p><Link href={href({date:null,view:'all'},interfaceRoutes[locale].football)}>{text.other} →</Link></div>:null}
          <div className="fixture-list">{sections.map((section,index)=>{const nav=navItems.find(item=>item.slug===section.slug),mark=competitionMark(nav??{slug:section.slug}),hasOdds=hasPregameOddsLayout(section.fixtures,now.getTime());return <section className="competition-section" data-group={section.group} data-odds-layout={hasOdds?'pregame':'none'} key={section.slug} aria-label={section.competition}>
            <header className="competition-header"><Link href={href({competition:section.slug,date:null,view:'all'},interfaceRoutes[locale].football)}><CountryMarkIcon mark={mark}/><h2 className="competition-title">{section.competition}</h2></Link><FavoriteButton locale={locale} kind="competition" id={section.slug} className="favorite-toggle-compact"/><span className="competition-count">{section.fixtures.length} {section.fixtures.length===1?(locale==='br'?'jogo':locale==='mx'?'partido':'match'):text.matches}</span>{hasOdds?<span className="board-odds-heading">{text.odds}</span>:null}</header>
            {section.fixtures.map(f=>{const live=f.status==='LIVE'||f.status==='HALFTIME',pending=f.status==='SCHEDULED'&&Date.parse(f.kickoff)<=now.getTime(),showOdds=f.status==='SCHEDULED'&&!pending;
              return <article key={f.id} className={`fixture-row${live?' is-live':''}${showOdds?' has-odds':' has-no-odds'}`} aria-label={`${f.homeTeam} – ${f.awayTeam}`} data-kickoff={f.kickoff} data-status={f.status}>
                <Link className="fixture-main-link" href={f.publicId?matchPath(locale,f.publicId,f.homeTeam,f.awayTeam):href({competition:section.slug})}>
                  <div className="fixture-timing"><time dateTime={f.kickoff}><span className="kickoff-time">{new Intl.DateTimeFormat(dictionary.locale,{hour:'2-digit',minute:'2-digit',timeZone}).format(new Date(f.kickoff))}</span>{!activeDate?<span className="kickoff-date">{new Intl.DateTimeFormat(dictionary.locale,{day:'2-digit',month:'2-digit',timeZone}).format(new Date(f.kickoff))}</span>:null}</time>
                    {(f.status!=='SCHEDULED'||pending)?<span className={`status-badge ${live?'is-live':''}`}>{pending?text.pending:dictionary.statuses[f.status]}</span>:null}</div>
                  <div className="team-stack"><TeamIdentity name={f.homeTeam} imageUrl={f.homeTeamImageUrl}><RedCardCount locale={locale} count={redCards[f.id]?.home}/></TeamIdentity><TeamIdentity name={f.awayTeam} imageUrl={f.awayTeamImageUrl}><RedCardCount locale={locale} count={redCards[f.id]?.away}/></TeamIdentity></div><ScoreDisplay fixture={f}/>
                </Link>
                {f.publicId?<FavoriteButton locale={locale} kind="fixture" id={f.publicId} className="favorite-toggle-row"/>:null}
                {showOdds?<OddsComparison locale={locale} commercialLocale={commercial??'br'} fixture={f}/>:null}
              </article>;
            })}
            {index===0&&sponsors?<SponsoredSlot copyLocale={locale} context={{locale:sponsorLocale,pagePath:sponsorPath,placement:'competition_inline',competitionSlug:section.slug}}/>:null}
          </section>;})}</div>
          </>:null}
        </div>
        {sponsor('home_right_rail')}
      </div>
    </main>
  </div>;
}
