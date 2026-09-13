import Link from 'next/link';
import {connection} from 'next/server';
import {headers} from 'next/headers';
import {localeRoutes,type PageKey} from '@/config/i18n';
import {loadM3PageData} from '@/delivery/runtime';
import {FixtureStatus} from '@/domain/enums';
import {SiteHeader} from '@/components/sports/SiteHeader';
import {competitionAnchor} from '@/components/sports/CompetitionTabs';
import {TeamIdentity,ScoreDisplay} from '@/components/sports/FixtureCard';
import {OddsComparison} from '@/components/sports/OddsComparison';
import {SponsoredSlot} from '@/components/commercial/SponsoredSlot';
import {englishDictionary as dictionary,matchPath} from './interface';
import {englishSportsData} from './sports-copy';
import {commercialLocale,requestCommercialGeo} from '@/odds/commercial-geo';

export async function EnglishSportsPage({page}:{page:PageKey}) {
  await connection();
  // Reuse the stored global football coverage; this is not a commercial GEO signal.
  const data=englishSportsData(await loadM3PageData('br',page==='live'?'live':'football'));
  const commercial=commercialLocale(requestCommercialGeo(await headers()));
  const brPath=localeRoutes.br[page];
  const today=new Date().toISOString().slice(0,10);
  const sections=data.sections.map(section=>({...section,fixtures:section.fixtures.filter(fixture=>
    (page!=='home'&&page!=='today')||fixture.kickoff.slice(0,10)===today)}));
  const fixtures=sections.flatMap(section=>section.fixtures);
  const summary=[['Live',fixtures.filter(row=>[FixtureStatus.LIVE,FixtureStatus.HALFTIME].includes(row.status)).length,'is-live'],
    ['Scheduled',fixtures.filter(row=>row.status===FixtureStatus.SCHEDULED).length,'is-upcoming'],
    ['Finished',fixtures.filter(row=>row.status===FixtureStatus.FINISHED).length,'']];
  const groups:Record<string,string>={BRAZIL:'Brazil',EUROPE:'Europe',AMERICAS:'Americas',INTERNATIONAL:'International',OTHER:'Other'};
  const content=dictionary.pages[page];
  return <div lang="en" className="app-shell english-sports"><SiteHeader locale="en" activePage={page}/>
    <main id="fixtures-content" className="page-container">
      {commercial==='br'?<SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPath,placement:'home_top_banner'}}/>:null}
      <header className="page-header"><div className="page-context"><span className="page-context-dot"/>Football · <time dateTime={today}>{new Intl.DateTimeFormat('en',{dateStyle:'full',timeZone:'UTC'}).format(new Date())}</time></div>
        <div className="page-heading-row"><div><h1 className="page-title">{content.title}</h1><p className="page-description">{content.description}</p></div>
          <span className={`freshness is-${data.sportsData.freshness}`}><span className="freshness-dot"/>{data.sportsData.freshness==='fresh'?'Latest saved scores':data.sportsData.freshness==='stale'?'Updates delayed':'Updates unavailable'}</span></div>
        <p className="english-timezone">All times in UTC</p></header>
      {commercial==='br'?<SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPath,placement:'mobile_inline'}}/>:null}
      <section className="context-panel scoreboard-summary" aria-label="Overview"><h2 className="context-panel-title">Overview</h2><div className="status-summary">{summary.map(([label,count,style])=><div className="summary-item" key={label}><span className={`summary-dot ${style}`} aria-hidden="true"/><span className="summary-label">{label}</span><strong className="summary-count">{count}</strong></div>)}</div></section>
      <div className="sports-layout"><aside className="context-rail"><section className="context-panel competition-panel" aria-label="Competitions"><h2 className="context-panel-title">Competitions</h2>
        <nav className="competition-tabs" aria-label="Competitions"><a className="competition-tab is-active" href="#fixtures-content">All competitions</a>
          {Object.entries(groups).map(([group,label])=>{const rows=sections.filter(section=>section.group===group);return rows.length?<div className="competition-tab-group" key={group}><span className="competition-tab-group-label">{label}</span><div className="competition-tab-group-links">{rows.map(section=><a className="competition-tab" key={section.slug} href={`#${competitionAnchor(section.slug)}`}><span className="competition-tab-marker" aria-hidden="true"/>{section.competition}</a>)}</div></div>:null;})}</nav></section></aside>
      <div className="fixture-content">
        {data.sportsData.state==='unavailable'?<p role="status" className="provider-notice">Scores are temporarily unavailable. Please try again later.</p>:null}
        {!sections.length?<div className="empty-state"><div className="empty-copy"><h2>No matches available</h2><p>There are no recorded matches for this period.</p></div></div>:null}
        <div className="fixture-list">{sections.map(section=>{const id=competitionAnchor(section.slug);return <section id={id} key={id} aria-labelledby={`${id}-title`} className="competition-section" data-group={section.group}>
          <header className="competition-header"><div className="competition-name-wrap"><span className="competition-emblem" aria-hidden="true">{section.competition.split(' ').slice(0,2).map(word=>word[0]).join('')}</span><h2 id={`${id}-title`} className="competition-title">{section.competition}</h2></div><span className="competition-count">{section.fixtures.length} {section.fixtures.length===1?'match':'matches'}</span></header>
          {section.fixtures.length?<><div className="fixture-table-head" aria-hidden="true"><span>Status</span><span>Teams</span><span>Score</span><span>Odds</span></div>{section.fixtures.map(fixture=>{const live=[FixtureStatus.LIVE,FixtureStatus.HALFTIME].includes(fixture.status);const body=<><div className="fixture-timing"><time dateTime={fixture.kickoff}><span className="kickoff-time">{new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(fixture.kickoff))}</span><span className="kickoff-date">{new Intl.DateTimeFormat('en',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(fixture.kickoff))}</span></time><span className={`status-badge ${live?'is-live':fixture.status===FixtureStatus.FINISHED?'is-finished':''}`}>{dictionary.statuses[fixture.status]}</span></div><div className="team-stack"><TeamIdentity name={fixture.homeTeam} imageUrl={fixture.homeTeamImageUrl}/><TeamIdentity name={fixture.awayTeam} imageUrl={fixture.awayTeamImageUrl}/></div><ScoreDisplay fixture={fixture}/></>;
            return <article className={`fixture-row ${live?'is-live':''}`} key={fixture.id} aria-label={`${fixture.homeTeam} – ${fixture.awayTeam}`}>{fixture.publicId?<Link className="fixture-main-link" href={matchPath('en',fixture.publicId,fixture.homeTeam,fixture.awayTeam)}>{body}</Link>:<div className="fixture-main-link">{body}</div>}<OddsComparison locale="en" fixture={fixture} emptyLabel="Unavailable"/></article>;})}</>:<p className="competition-empty-state">No matches scheduled in this period.</p>}
        </section>;})}</div></div>
        {commercial==='br'?<SponsoredSlot copyLocale="en" context={{locale:'br',pagePath:brPath,placement:'home_right_rail'}}/>:null}
      </div>
    </main></div>;
}
