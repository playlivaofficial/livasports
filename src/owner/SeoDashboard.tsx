import Link from 'next/link';
import type {SeoReport,SeoSearchReport} from '@/seo/report';
import {SeoSearchPerformance} from './SeoSearchPerformance';

const pctText=(value:number)=>`${Math.round(value*1000)/10}%`;
const delta=(current:number,baseline:number|null|undefined)=>{
  if(baseline===null||baseline===undefined)return '—';
  const diff=current-baseline;
  return `${diff>=0?'+':''}${diff}${baseline?` (${diff>=0?'+':''}${Math.round(diff/baseline*1000)/10}%)`:''}`;
};

/** Owner-only SEO monitoring. Server-rendered, noindex, no public exposure of Search Console data. */
export function SeoDashboard({report,search}:{report:SeoReport;search:SeoSearchReport|null}){
  const {latest,previous,alerts,scorecard,gsc,history,thresholds,unsubmitted}=report;
  const critical=alerts.filter(a=>a.severity==='CRITICAL');
  const families=Object.entries(latest?.families??{}).sort((a,b)=>b[1]-a[1]);
  return <main className="owner-health owner-seo">
    <header className="owner-health-header"><div>
      <h1>LivaSports SEO monitoring</h1>
      <p>Technical snapshot {latest?`${latest.day} · captured ${latest.capturedAt.slice(11,16)}Z`:'not captured yet'} ·
        {' '}Search Console <strong>{gsc.state}</strong> · provider requests on this page: 0 ·{' '}
        <Link href="/owner/growth/dashboard">Growth dashboard</Link> · <Link href="/owner/growth/scorecard">Weekly scorecard</Link> ·{' '}
        <Link href="/owner/health">Odds health</Link></p>
    </div></header>

    {!latest?<section className="owner-health-card" role="status">
      <h2>No snapshot yet</h2><p>The daily SEO monitor has not run. It stores the first snapshot on its next scheduled run.</p>
    </section>:null}

    {critical.length?<section className="owner-health-global" aria-label="Critical SEO alerts">
      {critical.map(a=><p key={a.code+a.urlFamily} className="owner-health-critical">
        <strong>{a.code}</strong>{a.urlFamily?` · ${a.urlFamily}`:''} — {a.reason} (now {a.current}, was {a.baseline})</p>)}
    </section>:null}

    {latest?<section aria-labelledby="seo-overview">
      <h2 id="seo-overview">Indexing health</h2>
      <div className="owner-health-cards">
        <div className="owner-health-card"><span>Submitted URLs</span><strong>{latest.submittedTotal.toLocaleString('en-GB')}</strong>
          <small>vs previous snapshot {delta(latest.submittedTotal,previous?.submittedTotal)}</small></div>
        <div className="owner-health-card"><span>Sampled URLs checked</span><strong>{latest.sampled}</strong>
          <small>status, robots and canonical per URL</small></div>
        <div className="owner-health-card"><span>Technical problems</span><strong>{latest.problems.length}</strong>
          <small>threshold {pctText(thresholds.problemRate)} of sampled</small></div>
        <div className="owner-health-card"><span>robots.txt</span><strong>{latest.robotsOk===null?'unknown':latest.robotsOk?'healthy':'unhealthy'}</strong>
          <small>both sitemaps declared</small></div>
      </div>
    </section>:null}

    {latest?<section aria-labelledby="seo-families">
      <h2 id="seo-families">Submitted inventory by route family</h2>
      <table className="owner-health-table"><thead><tr><th>Family</th><th>Submitted</th><th>vs previous</th></tr></thead>
        <tbody>{families.map(([family,count])=><tr key={family}><th>{family}</th><td>{count.toLocaleString('en-GB')}</td>
          <td>{delta(count,previous?.families?.[family as keyof typeof previous.families])}</td></tr>)}</tbody></table>
      <p className="owner-health-note">Locales: {Object.entries(latest.locales).map(([l,n])=>`${l} ${n.toLocaleString('en-GB')}`).join(' · ')}.
        The three locales mirror each other by construction; a skew above {pctText(thresholds.localeSkew)} raises LOCALE_SKEW.</p>
    </section>:null}

    {latest?.problems.length?<section aria-labelledby="seo-problems">
      <h2 id="seo-problems">Problems in sampled submitted URLs</h2>
      <table className="owner-health-table"><thead><tr><th>Type</th><th>Family</th><th>URL</th><th>Detail</th></tr></thead>
        <tbody>{latest.problems.slice(0,40).map(p=><tr key={p.type+p.url}><th>{p.type}</th><td>{p.family??'—'}</td>
          <td className="owner-health-evidence">{p.url}</td><td>{p.detail??'—'}</td></tr>)}</tbody></table>
    </section>:null}

    <section aria-labelledby="seo-scorecard">
      <h2 id="seo-scorecard">Weekly scorecard</h2>
      {(['ISSUES','WATCHLIST','WINS'] as const).map(bucket=>{
        const rows=scorecard.filter(e=>e.bucket===bucket);
        return <div key={bucket}><h3>{bucket}</h3>
          {rows.length?<ul className="owner-seo-list">{rows.map(e=><li key={bucket+e.code}>
            <strong>{e.code}</strong> — {e.statement} <small>(now {e.current}, baseline {e.baseline})</small></li>)}</ul>
            :<p className="owner-health-note">Nothing in this bucket.</p>}</div>;
      })}
    </section>

    <section aria-labelledby="seo-gsc">
      <h2 id="seo-gsc">Search performance</h2>
      {gsc.state==='CONNECTED'&&search?<SeoSearchPerformance search={search}/>:
        <div className="owner-health-card" role="status">
          <span>Search Console</span><strong>{gsc.state}</strong>
          <small>Property {gsc.property}</small>
          {gsc.missing?<p className="owner-health-evidence">Missing: {gsc.missing}</p>:null}
          {gsc.remedy?<p className="owner-health-note">Remedy: {gsc.remedy}</p>:null}
          <p className="owner-health-note">Clicks, impressions, CTR, average position, query and page reports stay
            unavailable until a property-scoped credential exists. No placeholder numbers are shown.</p>
        </div>}
    </section>

    {history.length>1?<section aria-labelledby="seo-trend">
      <h2 id="seo-trend">Submission trend</h2>
      <table className="owner-health-table"><thead><tr><th>Day</th><th>Submitted</th><th>Problems</th></tr></thead>
        <tbody>{[...history].reverse().slice(0,14).map(h=><tr key={h.day}><th>{h.day}</th>
          <td>{h.submittedTotal.toLocaleString('en-GB')}</td><td>{h.problemCount}</td></tr>)}</tbody></table>
    </section>:null}

    <section aria-labelledby="seo-intent">
      <h2 id="seo-intent">Deliberately not submitted</h2>
      <table className="owner-health-table"><thead><tr><th>Family</th><th>Why</th></tr></thead>
        <tbody>{unsubmitted.map(u=><tr key={u.family}><th>{u.family}</th><td>{u.why}</td></tr>)}</tbody></table>
    </section>
  </main>;
}
