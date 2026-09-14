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
import {boardDate,boardView,boardSort,matchesView,type BoardQuery,type BoardView} from './board-policy';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {CompetitionPanel} from '@/sports/CompetitionPanel';
import {SportsSearch} from '@/sports/Search';
import {loadCompetition,loadSportsCalendar,loadRedCards} from '@/sports/runtime';
import {RedCardCount} from '@/sports/RedCardCount';
import {competitionTab,sportsPage,sportsSeason} from '@/sports/policy';
import {sportsCopy} from '@/sports/copy';
import {BoardRefresh} from '@/sports/BoardRefresh';

const copy={
  br:{all:'Todos',live:'Ao vivo',upcoming:'Próximos',results:'Resultados',today:'Hoje',calendar:'Data dos jogos',go:'Ver',previous:'Dia anterior',next:'Dia seguinte',period:'Próximos 7 dias',competitions:'Competições',allCompetitions:'Todas as competições',empty:'Nenhum jogo neste filtro.',other:'Ver próximos jogos',odds:'Odds 1 X 2',pending:'Aguardando placar',fresh:'Últimos placares salvos',delayed:'Atualizações atrasadas',unavailable:'Atualizações indisponíveis',matches:'jogos'},
  mx:{all:'Todos',live:'En vivo',upcoming:'Próximos',results:'Resultados',today:'Hoy',calendar:'Fecha de partidos',go:'Ver',previous:'Día anterior',next:'Día siguiente',period:'Próximos 7 días',competitions:'Competiciones',allCompetitions:'Todas las competiciones',empty:'No hay partidos con este filtro.',other:'Ver próximos partidos',odds:'Cuotas 1 X 2',pending:'Esperando marcador',fresh:'Últimos marcadores guardados',delayed:'Actualizaciones retrasadas',unavailable:'Actualizaciones no disponibles',matches:'partidos'},
  en:{all:'All',live:'Live',upcoming:'Upcoming',results:'Results',today:'Today',calendar:'Match date',go:'Go',previous:'Previous day',next:'Next day',period:'Next 7 days',competitions:'Competitions',allCompetitions:'All competitions',empty:'No matches for this filter.',other:'View upcoming matches',odds:'Odds 1 X 2',pending:'Awaiting score',fresh:'Latest saved scores',delayed:'Updates delayed',unavailable:'Updates unavailable',matches:'matches'}
};
const groupCopy={br:{BRAZIL:'Brasil',AMERICAS:'Américas',EUROPE:'Europa',OTHER:'Outros'},mx:{BRAZIL:'Brasil',AMERICAS:'Américas',EUROPE:'Europa',OTHER:'Otros'},en:{BRAZIL:'Brazil',AMERICAS:'Americas',EUROPE:'Europe',OTHER:'Other'}};

export async function SportsBoardPage({locale,page,searchParams}:{locale:InterfaceLocale;page:PageKey;searchParams?:Promise<BoardQuery>}) {
  await connection();
  const now=new Date(),query=await searchParams??{},text=copy[locale],dictionary=interfaceDictionary(locale);
  const timeZone=await requestTimeZone(locale);
  const today=localDateKey(now,timeZone),calendarBounds=await loadSportsCalendar(locale,timeZone).catch(()=>({from:today,to:today})),date=boardDate(query.date,today,calendarBounds);
  const view=page==='live'?'live':boardView(query.view);
  const base=interfaceRoutes[locale][page];
  const requestedCompetition=typeof query.competition==='string'&&FOOTBALL_COMPETITION_TARGETS.some(t=>t.slug===query.competition)?query.competition:undefined;
  const tab=competitionTab(query.tab),season=sportsSeason(query.season);
  const hub=page==='football'&&requestedCompetition?await loadCompetition(requestedCompetition,locale,season,sportsPage(query.p)).catch(()=>null):null;
  const legacyOverview=!hub||(tab==='overview'&&!season&&!hub.seasonFallback);
  const raw=await loadM3PageData(locale==='en'?'br':locale,page,date,timeZone,requestedCompetition);
  const data=locale==='en'?englishSportsData(raw):raw;
  const competition=typeof query.competition==='string'&&data.sections.some(s=>s.slug===query.competition)?query.competition:undefined;
  const selectedCompetition=data.sections.find(s=>s.slug===competition);
  const period=competition?(locale==='br'?'Agenda da competição':locale==='mx'?'Calendario de la competición':'Competition schedule'):text.period;
  const allFixtures=data.sections.filter(s=>!competition||s.slug===competition).flatMap(s=>s.fixtures);
  const redCards=await loadRedCards(allFixtures.filter(f=>f.status!=='SCHEDULED').map(f=>f.id)).catch(()=>({} as Record<string,{home:number|null;away:number|null}>));
  const sections=data.sections.filter(s=>!competition||s.slug===competition).map(s=>({...s,fixtures:s.fixtures.filter(f=>matchesView(f,view,now.getTime())).sort((a,b)=>boardSort(a,b,now.getTime()))})).filter(s=>s.fixtures.length);
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
    <SiteHeader locale={locale} activePage={page}/>
    <BoardRefresh live={allFixtures.some(f=>f.status==='LIVE'||f.status==='HALFTIME')}/>
    <main id="fixtures-content" className="page-container">
      {sponsor('home_top_banner')}
      <header className="board-heading"><div><span className="board-eyebrow">{locale==='br'?'FUTEBOL':locale==='mx'?'FÚTBOL':'FOOTBALL'}</span><h1>{selectedCompetition?.competition??dictionary.pages[page].title}</h1></div>
        <span className={`freshness is-${data.sportsData.freshness}`}><span className="freshness-dot"/>{data.sportsData.freshness==='fresh'?text.fresh:data.sportsData.freshness==='stale'?text.delayed:text.unavailable}</span>
      </header>
      <SportsSearch locale={locale} query={query.q}/>
      {sponsor('mobile_inline')}
      <div className="sports-layout">
        <aside className="context-rail"><nav className="board-competitions" aria-label={text.competitions}><h2>{text.competitions}</h2>
          <Link href={href({competition:null})} aria-current={!competition?'page':undefined}>{text.allCompetitions}</Link>
          {Object.entries(groupCopy[locale]).map(([group,label])=><div key={group}><h3>{label}</h3>{data.sections.filter(s=>s.group===group).map(s=><Link key={s.slug} href={href({competition:s.slug,date:null,view:'all'},interfaceRoutes[locale].football)} aria-current={competition===s.slug?'page':undefined}><span>{s.competition}</span>{s.fixtures.length>0?<small>{s.fixtures.length}</small>:null}</Link>)}</div>)}
        </nav></aside>
        <div className="fixture-content">
          {hub?<CompetitionPanel hub={hub} locale={locale} tab={tab} legacyOverview={legacyOverview}/>:requestedCompetition&&page==='football'?<p className="sports-empty" role="status">{sportsCopy[locale].unavailable}</p>:null}
          {legacyOverview?<>
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
          {data.sportsData.state==='unavailable'?<p className="provider-notice" role="status">{text.unavailable}</p>:null}
          {!sections.length?<div className="board-empty" role="status"><p>{text.empty}</p><Link href={href({date:null,view:'all'},interfaceRoutes[locale].football)}>{text.other} →</Link></div>:null}
          <div className="fixture-list">{sections.map((section,index)=><section className="competition-section" data-group={section.group} key={section.slug} aria-label={section.competition}>
            <header className="competition-header"><Link href={href({competition:section.slug,date:null,view:'all'},interfaceRoutes[locale].football)}><h2 className="competition-title">{section.competition}</h2></Link><span className="competition-count">{section.fixtures.length} {section.fixtures.length===1?(locale==='br'?'jogo':locale==='mx'?'partido':'match'):text.matches}</span><span className="board-odds-heading">{text.odds}</span></header>
            {section.fixtures.map(f=>{const live=f.status==='LIVE'||f.status==='HALFTIME',pending=f.status==='SCHEDULED'&&Date.parse(f.kickoff)<=now.getTime();
              return <article key={f.id} className={`fixture-row ${live?'is-live':''}`} aria-label={`${f.homeTeam} – ${f.awayTeam}`} data-kickoff={f.kickoff} data-status={f.status}>
                <Link className="fixture-main-link" href={f.publicId?matchPath(locale,f.publicId,f.homeTeam,f.awayTeam):href({competition:section.slug})}>
                  <div className="fixture-timing"><time dateTime={f.kickoff}><span className="kickoff-time">{new Intl.DateTimeFormat(dictionary.locale,{hour:'2-digit',minute:'2-digit',timeZone}).format(new Date(f.kickoff))}</span>{!activeDate?<span className="kickoff-date">{new Intl.DateTimeFormat(dictionary.locale,{day:'2-digit',month:'2-digit',timeZone}).format(new Date(f.kickoff))}</span>:null}</time>
                    {(f.status!=='SCHEDULED'||pending)?<span className={`status-badge ${live?'is-live':''}`}>{pending?text.pending:dictionary.statuses[f.status]}</span>:null}</div>
                  <div className="team-stack"><TeamIdentity name={f.homeTeam} imageUrl={f.homeTeamImageUrl}><RedCardCount locale={locale} count={redCards[f.id]?.home}/></TeamIdentity><TeamIdentity name={f.awayTeam} imageUrl={f.awayTeamImageUrl}><RedCardCount locale={locale} count={redCards[f.id]?.away}/></TeamIdentity></div><ScoreDisplay fixture={f}/>
                </Link>
                {f.status==='SCHEDULED'&&!pending?<OddsComparison locale={locale} commercialLocale={commercial??'br'} fixture={f}/>:<div className="odds-slot odds-not-pregame"/>}
              </article>;
            })}
            {index===0&&sponsors?<SponsoredSlot copyLocale={locale} context={{locale:sponsorLocale,pagePath:sponsorPath,placement:'competition_inline',competitionSlug:section.slug}}/>:null}
          </section>)}</div>
          </>:null}
        </div>
        {sponsor('home_right_rail')}
      </div>
    </main>
  </div>;
}
