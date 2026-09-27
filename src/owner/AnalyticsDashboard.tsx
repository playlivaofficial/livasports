import Link from 'next/link';
import type {AnalyticsReport,RankedRow,ReportFilters} from '@/analytics/reporting';
import {PAGE_TYPES,REFERRER_CLASSES} from '@/analytics/taxonomy';
import {BOOKMAKER_REGISTRY} from '@/odds/registry';

const pct=(v:number)=>`${v.toFixed(v%1?1:0)}%`;
const ago=(iso:string|null)=>{if(!iso)return 'never';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;};
const MIN_SAMPLE=20;
function Ranked({title,rows,viewsLabel}:{title:string;rows:RankedRow[];viewsLabel:string}){
  return <section aria-label={title}><h2>{title}</h2>
    <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Item</th><th>{viewsLabel}</th><th>Sessions</th><th>Slip starts</th><th>Affiliate clicks</th><th>Click rate</th><th>Sample</th></tr></thead><tbody>
      {rows.map(r=><tr key={r.key}><td>{r.label}</td><td>{r.views}</td><td>{r.sessions}</td><td>{r.slips}</td><td>{r.clicks}</td><td>{Math.max(r.sessions,r.views)>=MIN_SAMPLE?pct(r.rate):'—'}</td><td>{Math.max(r.sessions,r.views)>=MIN_SAMPLE?'ok':`small (n=${Math.max(r.sessions,r.views)})`}</td></tr>)}
      {!rows.length?<tr><td colSpan={7}>No data in this window.</td></tr>:null}
    </tbody></table></div></section>;
}
/** Owner-only analytics (P4 §18–§25). Server-rendered from SQL aggregates; filters are plain GET parameters; providerRequests = 0. */
export function AnalyticsDashboard({report}:{report:AnalyticsReport}){
  const f=report.filters,c=report.cards;
  const link=(over:Partial<ReportFilters>)=>{const p=new URLSearchParams();const merged={...f,...over};for(const [k,v] of Object.entries(merged))if(v)p.set(k,String(v));return `/owner/analytics?${p.toString()}`;};
  return <main className="owner-health owner-analytics">
    <header className="owner-health-header"><div><h1>LivaSports product analytics</h1><p>Window {report.from.slice(0,16)}Z → {report.to.slice(0,16)}Z · traffic {f.traffic??'HUMAN'} · generated {ago(report.generatedAt)} · provider requests on this page: 0 · <Link href="/owner/health">Odds health</Link> · <Link href="/owner/growth">Traffic Engine</Link> · <Link href="/owner/growth/dashboard">Growth dashboard</Link></p></div>
      <nav className="owner-health-actions" aria-label="Window">{(['today','7d','30d'] as const).map(w=><Link key={w} className={w===f.window?'owner-analytics-active':''} href={link({window:w})}>{w==='today'?'Today':w==='7d'?'7 days':'30 days'}</Link>)}</nav></header>
    <form className="owner-health-filters" method="get" action="/owner/analytics">
      <input type="hidden" name="window" value={f.window}/>
      <label>Locale <select name="locale" defaultValue={f.locale??''}><option value="">all</option><option value="br">PT-BR</option><option value="mx">ES-MX</option><option value="en">EN</option></select></label>
      <label>GEO <select name="geo" defaultValue={f.geo??''}><option value="">all</option><option value="BR">BR</option><option value="MX">MX</option></select></label>
      <label>Bookmaker <select name="bookmaker" defaultValue={f.bookmaker??''}><option value="">all</option>{BOOKMAKER_REGISTRY.map(b=><option key={b.canonicalId} value={b.canonicalId}>{b.shortLabel}{b.displayRole==='HIDDEN_INSURANCE'?' (historical / insurance)':''}</option>)}</select></label>
      <label>Competition <input name="competition" defaultValue={f.competition??''} placeholder="slug"/></label>
      <label>Landing page type <select name="pageType" defaultValue={f.pageType??''}><option value="">all</option>{PAGE_TYPES.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
      <label>Source <select name="source" defaultValue={f.source??''}><option value="">all</option>{REFERRER_CLASSES.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
      <label>Traffic <select name="traffic" defaultValue={f.traffic??'HUMAN'}><option value="HUMAN">human (default)</option><option value="QA">QA</option><option value="OWNER">owner</option><option value="BOT">bot</option></select></label>
      <button type="submit">Apply</button>
    </form>
    <section className="owner-health-cards" aria-label="Core metrics">
      <div className="owner-health-card"><span>Sessions</span><strong>{c.sessions}</strong><small>{c.engagedSessions} engaged · {c.pageViews} page views</small></div>
      <div className="owner-health-card"><span>New visitors</span><strong>{c.newVisitors}</strong><small>first session on this browser</small></div>
      <div className="owner-health-card"><span>Returning visitors</span><strong>{c.returningVisitors}</strong><small>{report.retention.authenticatedReturning} signed in · {report.retention.anonymousReturning} anonymous · {pct(report.retention.returningShare)} of sessions</small></div>
      <div className="owner-health-card"><span>Match / competition views</span><strong>{c.contentViews}</strong><small>competition, match, team and player views</small></div>
      <div className="owner-health-card"><span>Odds selections</span><strong>{c.oddsSelections}</strong><small>selections added to My Slip</small></div>
      <div className="owner-health-card"><span>Slips created</span><strong>{c.slipsCreated}</strong><small>first leg of a new slip</small></div>
      <div className="owner-health-card"><span>Bookmaker comparisons</span><strong>{c.comparisons}</strong><small>sessions that viewed a comparison</small></div>
      <div className="owner-health-card"><span>Affiliate clicks</span><strong>{c.affiliateClicks}</strong><small>Ledger-backed outcomes: {c.outboundRedirects} redirects · {c.affiliateClicks-c.outboundRedirects} embed activations. Never registrations or revenue.</small></div>
      <div className="owner-health-card"><span>Click-through rate</span><strong>{pct(c.clickThroughRate)}</strong><small>sessions with an affiliate click ÷ sessions</small></div>
      <div className="owner-health-card"><span>Sign-ins</span><strong>{c.signIns}</strong><small>server-verified</small></div>
      <div className="owner-health-card"><span>Favorites added</span><strong>{c.favoritesAdded}</strong><small>server-verified</small></div>
    </section>
    <section aria-label="Funnel"><h2>My Slip funnel</h2>
      <p className="owner-health-notes">Each stage counts sessions with all preceding steps present. Restored slips and direct banner clicks remain in the overall metrics; this is a session cohort, not proof of chronological event order.</p>
      <table className="owner-health-table"><thead><tr><th>Stage</th><th>Sessions</th><th>From previous stage</th><th>From session</th></tr></thead><tbody>
        {report.funnel.map(s=><tr key={s.stage}><td>{s.stage}</td><td>{s.sessions}</td><td>{s.fromPrevious===null?'—':pct(s.fromPrevious)}</td><td>{pct(s.fromSession)}</td></tr>)}
      </tbody></table>
      <p className="owner-health-notes">Leg buckets (sessions): {report.legBuckets.map(b=>`${b.bucket}: ${b.sessions}`).join(' · ')} · Comparison states: {report.comparisonStates.map(s=>`${s.state}: ${s.sessions}`).join(' · ')}</p>
    </section>
    <section aria-label="Acquisition"><h2>Acquisition</h2>
      <table className="owner-health-table"><thead><tr><th>Source</th><th>Sessions</th><th>Engaged</th><th>Slips</th><th>Affiliate clicks</th><th>Conversion</th></tr></thead><tbody>
        {report.acquisition.map(a=><tr key={a.source}><td>{a.source}</td><td>{a.sessions}</td><td>{a.engaged}</td><td>{a.slips}</td><td>{a.clicks}</td><td>{a.sessions>=MIN_SAMPLE?pct(a.rate):`— (n=${a.sessions})`}</td></tr>)}
        {!report.acquisition.length?<tr><td colSpan={6}>No sessions in this window.</td></tr>:null}
      </tbody></table>
      {report.campaigns.length?<><h3>UTM campaigns</h3><table className="owner-health-table"><thead><tr><th>Campaign</th><th>Source</th><th>Medium</th><th>Sessions</th><th>Slips</th><th>Clicks</th></tr></thead><tbody>
        {report.campaigns.map(r=><tr key={r.campaign+r.source+r.medium}><td>{r.campaign}</td><td>{r.source??'—'}</td><td>{r.medium??'—'}</td><td>{r.sessions}</td><td>{r.slips}</td><td>{r.clicks}</td></tr>)}</tbody></table></>:null}
      <p className="owner-health-notes">Organic search keywords stay in Google Search Console; LivaSports records the search engine only.</p>
    </section>
    <section aria-label="Locale and GEO"><h2>Locale / commercial GEO</h2>
      <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Locale</th><th>Sessions</th><th>Odds selected</th><th>Slips</th><th>Affiliate clicks</th><th>Favorites</th><th>Sign-ins</th></tr></thead><tbody>
        {report.locales.map(l=><tr key={l.locale}><td>{l.locale==='br'?'PT-BR':l.locale==='mx'?'ES-MX':'EN'}</td><td>{l.sessions}</td><td>{l.odds}</td><td>{l.slips}</td><td>{l.clicks}</td><td>{l.favorites}</td><td>{l.signIns}</td></tr>)}
        {report.geos.map(g=><tr key={'geo-'+g.geo}><td>GEO {g.geo}</td><td>{g.sessions}</td><td>{g.odds}</td><td>{g.slips}</td><td>{g.clicks}</td><td>{g.favorites}</td><td>{g.signIns}</td></tr>)}
      </tbody></table></div>
      <p className="owner-health-notes">GEO is the commercial country from the request (never inferred from language).</p>
    </section>
    <Ranked title="Top landing pages" rows={report.top.landingPages} viewsLabel="Landings"/>
    <Ranked title="Top competitions" rows={report.top.competitions} viewsLabel="Views"/>
    <Ranked title="Top matches" rows={report.top.matches} viewsLabel="Views"/>
    <Ranked title="Top teams" rows={report.top.teams} viewsLabel="Views"/>
    <Ranked title="Affiliate CTA placements" rows={report.top.placements} viewsLabel="Impressions"/>
    <Ranked title="Bookmakers" rows={report.top.bookmakers} viewsLabel="CTA impressions"/>
    <section aria-label="Data quality"><h2>Data quality</h2>
      <div className="owner-health-cards">
        <div className={`owner-health-card ${report.quality.flags.length?'owner-health-state-degraded':'owner-health-state-healthy'}`}><span>Ingestion</span><strong>{report.quality.flags.length?report.quality.flags.join(' · '):'OK'}</strong><small>last event {ago(report.quality.lastEventAt)}</small></div>
        <div className="owner-health-card"><span>Accepted / duplicates</span><strong>{report.quality.accepted} / {report.quality.duplicates}</strong><small>duplicate rate {pct(report.quality.duplicateRate)}</small></div>
        <div className="owner-health-card"><span>Rejected</span><strong>{report.quality.rejected}</strong><small>unknown types {report.quality.unknownEvents} · missing session {report.quality.missingSession} · oversized {report.quality.oversized}</small></div>
        <div className="owner-health-card"><span>Server events / lag</span><strong>{report.quality.serverEvents}</strong><small>max client→server lag {report.quality.maxLagSeconds}s · client interactions {c.ctaInteractions} vs verified outcomes {c.affiliateClicks}</small></div>
        <div className="owner-health-card"><span>Traffic mix (events)</span><strong>{report.quality.trafficMix.map(t=>`${t.trafficClass} ${t.events}`).join(' · ')||'—'}</strong><small>QA, owner and bot traffic are excluded from the numbers above unless selected</small></div>
      </div>
    </section>
    <footer className="owner-health-footer"><p>First-party analytics only. Registrations, FTDs and revenue are never shown here; they come from operator-verified affiliate feeds (separate tables).</p></footer>
  </main>;
}
