import Link from 'next/link';
import type {FunnelStep,GrowthReport,MetricDelta,WeeklyScorecard} from '@/analytics/growth-report';
import {ACQUISITION_BUCKETS,BUCKET_LABELS,SCORECARD_RULES} from '@/analytics/growth-report';
import {growthQueryString,toLocalDay,type ParsedGrowthQuery} from '@/analytics/growth-filters';
import {PAGE_TYPES} from '@/analytics/taxonomy';
import {SortableTable} from './SortableTable';
import {TrendChart} from './TrendChart';
import {GROWTH_TABLES,metricLabel,SCORECARD_COLUMNS,scorecardRows} from './tables';

const fmt=(value:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
function Delta({delta}:{delta:MetricDelta}){
  const points=delta.key==='bookmakerCtr';
  if(!delta.change)return <p className="growth-delta growth-delta-flat">no change vs previous</p>;
  const up=delta.change>0,text=points?`${up?'+':''}${fmt(delta.change)} pts`:`${up?'+':''}${fmt(delta.change)}${delta.changePct===null?' (new)':` (${up?'+':''}${fmt(delta.changePct)}%)`}`;
  return <p className={`growth-delta ${up?'growth-delta-up':'growth-delta-down'}`}>{up?'▲':'▼'} {text} vs {fmt(delta.previous)}{points?'%':''}</p>;
}
function Funnel({steps,label}:{steps:FunnelStep[];label:string}){
  const top=Math.max(1,steps[0]?.sessions??0);
  return <ol className="growth-funnel" aria-label={label}>{steps.map(step=><li key={step.key}>
    <span>{step.label}</span><div className="growth-funnel-bar" title={`${step.sessions} sessions`}><span style={{width:`${Math.max(.5,step.sessions/top*100)}%`}}/></div>
    <small>{fmt(step.sessions)} · {step.fromPrevious===null?'100%':`${fmt(step.fromPrevious)}% of prev`} · {fmt(step.fromStart)}% overall</small></li>)}</ol>;
}
const csv=(parsed:ParsedGrowthQuery,table:string)=>`/api/owner/growth/dashboard/export?${growthQueryString(parsed,{table})}`;
function Filters({parsed,action}:{parsed:ParsedGrowthQuery;action:string}){
  const f=parsed.filters;
  return <form className="owner-health-filters" method="get" action={action} aria-label="Filters">
    <label>From <input type="date" name="from" defaultValue={toLocalDay(f.from)}/></label>
    <label>To <input type="date" name="to" defaultValue={toLocalDay(new Date(f.to.getTime()-1))}/></label>
    <label>Locale <select name="locale" defaultValue={f.locale??''}><option value="">all</option><option value="br">PT-BR</option><option value="mx">ES-MX</option><option value="en">EN</option></select></label>
    <label>GEO <select name="geo" defaultValue={f.geo??''}><option value="">all</option><option value="BR">BR</option><option value="MX">MX</option></select></label>
    <label>Source <select name="source" defaultValue={f.source??''}><option value="">all</option>{ACQUISITION_BUCKETS.map(bucket=><option key={bucket} value={bucket}>{BUCKET_LABELS[bucket]}</option>)}</select></label>
    <label>Competition <input name="competition" defaultValue={f.competition??''} placeholder="slug" size={14}/></label>
    <label>Club <input name="team" defaultValue={f.team??''} placeholder="team public id" size={16}/></label>
    <label>Landing page type <select name="pageType" defaultValue={f.pageType??''}><option value="">all</option>{PAGE_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
    <button type="submit">Apply</button>
  </form>;
}
function Nav({parsed,current}:{parsed:ParsedGrowthQuery;current:'dashboard'|'weekly'}){
  const q=growthQueryString(parsed);
  return <nav className="growth-nav" aria-label="Growth views">
    <Link className={current==='dashboard'?'owner-analytics-active':''} href={`/owner/growth/dashboard?${q}`}>Dashboard</Link>
    <Link className={current==='weekly'?'owner-analytics-active':''} href={`/owner/growth/scorecard?${q}`}>Weekly scorecard</Link>
    <Link href="/owner/growth">Growth queue</Link><Link href="/owner/analytics">Product analytics</Link></nav>;
}

/** Owner Growth Dashboard. Server-rendered from SQL aggregates; HUMAN traffic only; no provider calls. */
export function GrowthDashboardView({report,parsed}:{report:GrowthReport;parsed:ParsedGrowthQuery}){
  const f=report.filters,q=(over:Record<string,string|undefined>)=>`/owner/growth/dashboard?${growthQueryString({...parsed,preset:'7d'},{...over})}`;
  const card=(key:MetricDelta['key'],note?:string)=>{const delta=report.deltas.find(item=>item.key===key)!;
    return <div className="owner-health-card" key={key}><span>{metricLabel(key)}</span><strong>{fmt(delta.current)}{key==='bookmakerCtr'?'%':''}</strong><Delta delta={delta}/>{note?<small>{note}</small>:null}</div>;};
  const tables=(names:string[])=>names.map(name=>{const table=GROWTH_TABLES[name]!;return <SortableTable key={name} caption={table.caption} columns={table.columns} rows={table.rows(report)} csvHref={csv(parsed,name)}/>;});
  return <main className="owner-health owner-analytics growth-dashboard">
    <header className="owner-health-header"><div><h1>Growth dashboard</h1>
      <p>{toLocalDay(new Date(f.from))} → {toLocalDay(new Date(new Date(f.to).getTime()-1))} (São Paulo) vs {toLocalDay(new Date(f.previousFrom))} → {toLocalDay(new Date(new Date(f.previousTo).getTime()-1))} · HUMAN sessions only · generated {report.generatedAt.slice(0,16)}Z · provider requests: 0</p></div>
      <Nav parsed={parsed} current="dashboard"/></header>
    <nav className="owner-health-actions" aria-label="Period">{(['7d','14d','30d'] as const).map(range=><Link key={range} className={parsed.preset===range?'owner-analytics-active':''} href={q({range})}>{range.replace('d',' days')}</Link>)}</nav>
    <Filters parsed={parsed} action="/owner/growth/dashboard"/>

    <section aria-labelledby="overview"><h2 id="overview">Current period overview</h2>
      <div className="owner-health-cards">
        {card('sessions')}{card('organicSessions','Google + other search, no social UTM')}{card('socialSessions','TikTok, Instagram, YouTube, editorial and other social')}
        {card('matchViews')}{card('oddsInteractions','Odds selected into My Slip')}{card('slipAdds')}{card('slipsCreated')}{card('slipsOpened')}
        {card('ctaClicks','Client-side bookmaker CTA clicks')}{card('outboundRedirects','Server-confirmed; the commercial click ledger')}{card('bookmakerCtr','Sessions with an outbound redirect ÷ sessions')}
      </div>
      <div className="growth-grid-2">
        <TrendChart title="Sessions per day" points={report.trend} valueKey="sessions" previousKey="previousSessions" unit="sessions"/>
        <TrendChart title="Bookmaker outbound clicks per day" points={report.trend} valueKey="clicks" previousKey="previousClicks" unit="clicks"/>
      </div>
      {tables(['overview'])}
    </section>

    <section aria-labelledby="funnel"><h2 id="funnel">Funnel</h2>
      <p className="growth-rules">Strict funnel: a session counts at a step only if it also reached every earlier step. Revenue is not a funnel step until verified operator data exists.</p>
      <Funnel steps={report.funnel} label="Site funnel"/>
      <SortableTable caption="Funnel by acquisition source" csvHref={csv(parsed,'funnel')} columns={[{key:'source',label:'Source'},{key:'s0',label:'Sessions',numeric:true},{key:'s1',label:'Match view',numeric:true},{key:'s2',label:'Odds',numeric:true},{key:'s3',label:'Slip add',numeric:true},{key:'s4',label:'Comparison',numeric:true},{key:'s5',label:'Outbound',numeric:true},{key:'overall',label:'Overall',numeric:true,suffix:'%'}]}
        rows={report.funnelByBucket.map(row=>({source:row.label,s0:row.steps[0]!,s1:row.steps[1]!,s2:row.steps[2]!,s3:row.steps[3]!,s4:row.steps[4]!,s5:row.steps[5]!,overall:row.steps[0]?Math.round(row.steps[5]!/row.steps[0]!*1000)/10:0}))}/>
    </section>

    <section aria-labelledby="acquisition"><h2 id="acquisition">Acquisition</h2>{tables(['acquisition'])}</section>

    <section aria-labelledby="winners"><h2 id="winners">Top content · money signals</h2>
      <p className="growth-rules">Labels are the single highest value in each table: traffic winner (sessions), engagement winner (slip adds), bookmaker-click winner (server-confirmed clicks). {report.revenue.verified?'':'No verified revenue data exists, so nothing is called a revenue winner.'}</p>
      <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Label</th><th>Dimension</th><th>Item</th><th>Value</th></tr></thead><tbody>
        {report.winners.map((winner,index)=><tr key={index}><td><span className={`growth-badge ${winner.label==='bookmaker-click winner'?'growth-badge-winner':'growth-badge-off'}`}>{winner.label}</span></td><td>{winner.dimension}</td><td>{winner.key}</td><td className="growth-num">{winner.value}</td></tr>)}
        {!report.winners.length?<tr><td colSpan={4}>No signal yet in this period.</td></tr>:null}</tbody></table></div>
      <div className="growth-grid-2">{tables(['landing','matches','competitions','teams','platforms','angles','families','templates'])}</div>
    </section>

    <section aria-labelledby="engine"><h2 id="engine">Traffic Engine performance</h2>
      <p className="growth-rules">Current (unsuperseded) growth items made in or up to 14 days before the period, joined to the HUMAN sessions their tracked links brought (utm_campaign traffic_engine_v1, utm_content match_&lt;id&gt;). Publishing is manual; status is the owner queue status.</p>
      {tables(['engine'])}</section>

    <section aria-labelledby="seo"><h2 id="seo">SEO / organic</h2>
      <div className="owner-health-cards"><div className="owner-health-card"><span>Organic landing sessions</span><strong>{fmt(report.seo.organicSessions)}</strong><Delta delta={report.deltas.find(delta=>delta.key==='organicSessions')!}/></div></div>
      <div className="growth-unavailable"><article><h3>{report.seo.searchConsole.label}</h3><p><span className="growth-badge growth-badge-off">{report.seo.searchConsole.status}</span></p>
        <p>Not shown until an authenticated integration exists: {report.seo.searchConsole.metrics.join(', ')}. Nothing here is estimated from internal traffic.</p></article></div>
      <Funnel steps={report.seo.funnel} label="Organic funnel"/>
      <div className="growth-grid-2">{tables(['organic','organicCompetitions'])}</div>
    </section>

    <section aria-labelledby="social"><h2 id="social">Social platforms</h2>
      <p className="growth-rules">Site-side performance (UTM and referrer) works now. Native platform metrics are unavailable while publishing is manual and no platform API is connected.</p>
      <div className="growth-unavailable">{report.social.native.map(source=><article key={source.id}><h3>{source.label}</h3><p><span className="growth-badge growth-badge-off">{source.status}</span></p><p>Unavailable: {source.metrics.join(', ')}.</p></article>)}</div>
      <SortableTable caption="Site-side social performance" columns={[{key:'source',label:'Platform'},{key:'sessions',label:'Sessions',numeric:true},{key:'slipAdds',label:'Slip adds',numeric:true},{key:'clicks',label:'Bookmaker clicks',numeric:true},{key:'ctr',label:'Session CTR',numeric:true,suffix:'%'}]}
        rows={report.social.utm.map(row=>({source:row.label,sessions:row.sessions,slipAdds:row.slipAdds,clicks:row.clicks,ctr:row.ctr}))} csvHref={csv(parsed,'platforms')}/>
    </section>

    <section aria-labelledby="revenue"><h2 id="revenue">Revenue</h2>
      {report.revenue.verified?<p>{report.revenue.events} verified operator conversion events · reported revenue {report.revenue.revenue??'—'} {report.revenue.currency??''} · commission {report.revenue.commission??'—'} {report.revenue.currency??''}</p>
        :<p><span className="growth-badge growth-badge-off">No verified revenue data</span> Operator conversion events are only recorded from real operator evidence; none exist for this period.</p>}
    </section>

    <section aria-labelledby="quality"><h2 id="quality">Data quality</h2>
      <p className="growth-rules">Every KPI above counts HUMAN sessions and only the HUMAN events inside them. QA, OWNER and BOT traffic is listed here and excluded.</p>
      <div className="owner-health-cards">
        <div className="owner-health-card"><span>Click reconciliation</span><strong>{report.quality.reconciliation.status}</strong><small>ledger {report.quality.reconciliation.ledgerHumanClicks} · analytics {report.quality.reconciliation.analyticsHumanRedirects} · matched {report.quality.reconciliation.matched}</small></div>
        <div className="owner-health-card"><span>Owner/QA redirects excluded</span><strong>{report.quality.excludedOutboundBySession}</strong><small>labelled HUMAN by the redirect, reclassified by their session</small></div>
        <div className="owner-health-card"><span>Redirects without a session</span><strong>{report.quality.outboundWithoutSession}</strong><small>no analytics cookie; not attributable to a source</small></div>
      </div>
      {report.quality.flags.length?<ul className="owner-health-issues">{report.quality.flags.map(flag=><li key={flag}><code>{flag}</code></li>)}</ul>:<p>No data-quality flags.</p>}
      {tables(['quality'])}
    </section>
  </main>;
}

export function WeeklyScorecardView({card,parsed}:{card:WeeklyScorecard;parsed:ParsedGrowthQuery}){
  const week=new Date(card.week.from),q=(date:Date)=>`/owner/growth/scorecard?${growthQueryString(parsed,{week:toLocalDay(date)})}`;
  const r=SCORECARD_RULES,top=(title:string,rows:WeeklyScorecard['top']['landingPages'])=><SortableTable caption={title} columns={GROWTH_TABLES.landing!.columns} rows={GROWTH_TABLES.landing!.rows({...card.report,top:{...card.report.top,landingPages:rows}})}/>;
  const single=(title:string,row:WeeklyScorecard['top']['socialSource'])=><div className="owner-health-card"><span>{title}</span><strong>{row?row.label:'—'}</strong><small>{row?`${row.sessions} sessions · ${row.clicks} bookmaker clicks · ${row.ctr}% CTR`:'No attributed sessions this week'}</small></div>;
  return <main className="owner-health owner-analytics growth-dashboard">
    <header className="owner-health-header"><div><h1>Weekly scorecard · {card.week.label}</h1>
      <p>Monday–Sunday, São Paulo time · compared with the prior week · HUMAN traffic only{card.complete?'':' · week in progress'}</p></div><Nav parsed={parsed} current="weekly"/></header>
    <nav className="owner-health-actions" aria-label="Week"><Link href={q(new Date(week.getTime()-7*86_400_000))}>← Previous week</Link><Link href={q(new Date(week.getTime()+7*86_400_000))}>Next week →</Link>
      <a href={`/api/owner/growth/dashboard/export?${growthQueryString(parsed,{table:'weekly',week:toLocalDay(week)})}`} download>Weekly snapshot CSV</a>
      <a href={`/api/owner/growth/dashboard/export?${growthQueryString(parsed,{table:'weekly-json',week:toLocalDay(week)})}`} download>Weekly snapshot JSON</a></nav>
    <section aria-labelledby="week-metrics"><h2 id="week-metrics">The week</h2><div className="owner-health-cards">{card.metrics.map(delta=><div className="owner-health-card" key={delta.key}><span>{metricLabel(delta.key)}</span><strong>{fmt(delta.current)}{delta.key==='bookmakerCtr'?'%':''}</strong><Delta delta={delta}/></div>)}</div></section>
    <section aria-labelledby="week-top"><h2 id="week-top">Top of the week</h2>
      <div className="owner-health-cards">{single('Top social source',card.top.socialSource)}{single('Top story angle',card.top.storyAngle)}{single('Top creative family',card.top.creativeFamily)}</div>
      <div className="growth-grid-2">{top('Top 5 landing pages',card.top.landingPages)}{top('Top 5 matches',card.top.matches)}{top('Top competitions',card.top.competitions)}{top('Top clubs',card.top.clubs)}</div></section>
    <section aria-labelledby="week-signals"><h2 id="week-signals">Winners · Watchlist · Weak signals</h2>
      <ul className="growth-rules">
        <li><span className="growth-badge growth-badge-winner">WINNER</span> ≥{r.minSessions} sessions and session CTR ≥ {r.winnerCtrMultiple}× the site CTR ({card.report.current.bookmakerCtr}%), or the most bookmaker clicks in its table (≥{r.winnerMinClicks}).</li>
        <li><span className="growth-badge growth-badge-watch">WATCHLIST</span> ≥{r.watchMinSessions} sessions and +{r.watchGrowthPct}% week on week, new this week, or high CTR on fewer than {r.minSessions} sessions.</li>
        <li><span className="growth-badge growth-badge-weak">WEAK</span> ≥{r.minSessions} sessions with no bookmaker clicks, or {r.weakDropPct}% or worse week on week from ≥{r.minSessions} sessions.</li></ul>
      <SortableTable caption={`${card.scored.winners.length} winners · ${card.scored.watchlist.length} watchlist · ${card.scored.weak.length} weak`} columns={SCORECARD_COLUMNS} rows={scorecardRows(card)} initialSort="verdict" empty="Not enough data this week for any label."/></section>
  </main>;
}
