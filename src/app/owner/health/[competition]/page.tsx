import {headers} from 'next/headers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ownerConfigured,requestOwnerSession} from '@/owner/session';
import {CompetitionActions,OwnerHealthLogin} from '@/owner/HealthDashboard';
import {stateClass} from '@/owner/health-ui';
import {readCompetitionDetail} from '@/owner/health-server';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readReliabilityHealth,type ReliabilityHealth} from '@/odds/reliability/read';
import {parseRecoveryTarget} from '@/odds/reliability/recovery';
import {matchPath} from '@/localization/interface';
import '../../../owner-health.css';
export const dynamic='force-dynamic';
export const metadata={title:'Owner health · competition',robots:{index:false,follow:false,nocache:true}};
const ago=(iso:string|null)=>{if(!iso)return '—';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;};
const when=(iso:string)=>iso.replace('T',' ').slice(0,16)+'Z';
/** Incident detail (P3 §18): affected fixtures, quote state and ages, provider requests, scheduler decisions, recovery attempts, incidents. */
export default async function OwnerHealthCompetitionPage({params}:{params:Promise<{competition:string}>}){
  const {competition}=await params;
  if(!parseRecoveryTarget(competition)?.geo)notFound();
  const h=await headers(),session=requestOwnerSession(h);
  if(!session)return <OwnerHealthLogin configured={ownerConfigured()}/>;
  const url=databaseUrl();
  if(!url)return <main className="owner-health"><h1>Owner health</h1><p role="alert">Database is not configured.</p></main>;
  const loaded=await loadCompetition(url,competition);
  if(!loaded)return <main className="owner-health"><h1>{competition}</h1><p role="alert">Detail could not be read. Try again shortly.</p></main>;
  const {health,summary,detail}=loaded;
  if(!summary)notFound();
  if(!detail)notFound();
  const headroom=health.budget?.headroom??0;
  return <main className="owner-health">
      <header className="owner-health-header"><div><h1>{competition}</h1><p><span className={stateClass(summary.health)}>{summary.health}</span> · target {summary.targetState} · provider {summary.providerState} · tournament {summary.tournamentId??'none'} · catalog {summary.catalogState} · last success {ago(summary.lastSuccessAt)} · <Link href="/owner/health">← all competitions</Link></p></div>
        <CompetitionActions competition={competition} canRefresh={!!summary.tournamentId&&detail.requestCost>0&&headroom>=detail.requestCost} requestCost={detail.requestCost}/></header>
      <section className="owner-health-cards" aria-label="Competition summary">
        {(['24h','3d','7d','14d'] as const).map(k=><div key={k} className="owner-health-card"><span>{detail.geo} · next {k}</span><strong>{summary.windows[k].anyOdds}/{summary.windows[k].fixtures}</strong><small>MW {summary.windows[k].matchWinner} · OU2.5 {summary.windows[k].totalGoals25} · BTTS {summary.windows[k].btts} · no current price {summary.windows[k].neither} · stale {summary.windows[k].staleOnly}</small></div>)}
        <div className="owner-health-card"><span>Verified {detail.geo} operator feeds</span><strong>{detail.operatorFeeds.length}</strong><small>Refresh uses up to {detail.requestCost} earliest-due feeds. No cross-country quotes or insurance proxies.</small></div>
        <div className="owner-health-card"><span>Quote ages (7d)</span><strong>p50 {summary.quoteAges.p50Minutes??'—'} min</strong><small>p95 {summary.quoteAges.p95Minutes??'—'} · oldest {summary.quoteAges.oldestMinutes??'—'} · current {summary.quoteAges.currentQuotes} · aging/stale {summary.quoteAges.staleQuotes} · expired {summary.quoteAges.expiredQuotes}</small></div>
        {summary.baseline?<div className="owner-health-card"><span>{detail.geo} baseline (24h ago)</span><strong>{summary.baseline.any7d}/{summary.baseline.fixtures7d}</strong><small>{ago(summary.baseline.evaluatedAt)}</small></div>:null}
      </section>
      <section aria-label="Issues"><h2>Classification</h2>
        {summary.issues.length?<ul className="owner-health-issues">{summary.issues.map((i,n)=><li key={n}><span className={stateClass(i.severity)}>{i.severity}</span> <strong>{i.classification}</strong>{i.bookmaker?` · ${i.bookmaker}`:''} — {i.evidence} ({i.affectedFixtures} fixture(s))</li>)}</ul>:<p>No issues detected.</p>}
        {summary.notes.length?<ul className="owner-health-notes">{summary.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>:null}
      </section>
      <section aria-label="Bookmaker feeds"><h2>Bookmaker feeds</h2>
        <table className="owner-health-table"><thead><tr><th>Bookmaker</th><th>Last success</th><th>Last attempt</th><th>Failures</th><th>Last error</th><th>Retry after</th><th>Latest snapshot</th><th>Latest request</th></tr></thead><tbody>
          {summary.feeds.map(f=><tr key={f.bookmaker}><td>{f.bookmaker}</td><td>{ago(f.lastSuccessAt)}</td><td>{ago(f.lastAttemptAt)}</td><td>{f.consecutiveFailures}</td><td>{f.lastError??'—'}</td><td>{f.retryAfter?when(f.retryAfter):'—'}</td>
            <td>{f.snapshot?`${when(f.snapshot.observedAt)} · ${f.snapshot.returnedFixtures} fixtures / ${f.snapshot.quotes} quotes · near-term ${f.snapshot.nearTermFixtures} fixtures / ${f.snapshot.nearTermQuotes} quotes`:'—'}</td>
            <td>{f.request?`${when(f.request.startedAt)} · ${f.request.outcome}${f.request.httpStatus?` (${f.request.httpStatus})`:''}`:'—'}</td></tr>)}
          {!summary.feeds.length?<tr><td colSpan={8}>No scheduler target for this competition.</td></tr>:null}
        </tbody></table></section>
      <section aria-label="Fixtures"><h2>Fixtures inside 14 days ({detail.fixtures.length})</h2>
        <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Kickoff</th><th>Tier</th><th>Fixture</th><th>Mapping</th><th>Quotes (bookmaker · market · freshness · age/TTL · price)</th></tr></thead><tbody>
          {detail.fixtures.map(f=><tr key={f.publicId}><td>{when(f.kickoff)}</td><td>{f.tier}</td><td><Link href={matchPath('en',f.publicId,f.home,f.away)}>{f.home} v {f.away}</Link></td><td>{f.mappingState??'—'}{f.mappingReason&&f.mappingState!=='EXACT'&&f.mappingState!=='HIGH_CONFIDENCE'?` · ${f.mappingReason}`:''}</td>
            <td>{f.quotes.length?<ul className="owner-health-quotes">{f.quotes.map((q,n)=><li key={n} className={`owner-health-fresh-${q.freshness.toLowerCase()}`}>{q.bookmaker} · {q.market} · {q.freshness} · {q.ageMinutes}/{q.ttlMinutes??'—'} min · {q.price}</li>)}</ul>:<em>no quotes stored</em>}</td></tr>)}
        </tbody></table></div></section>
      <section aria-label="Provider requests"><h2>Latest provider requests (3 days)</h2>
        <table className="owner-health-table"><thead><tr><th>When</th><th>Bookmaker</th><th>Tournaments</th><th>Outcome</th><th>HTTP</th><th>Purpose</th></tr></thead><tbody>
          {detail.requests.map((r,n)=><tr key={n}><td>{when(r.startedAt)}</td><td>{r.bookmaker??'—'}</td><td>{r.tournamentIds??'—'}</td><td>{r.outcome}</td><td>{r.httpStatus??'—'}</td><td>{r.purpose}</td></tr>)}
          {!detail.requests.length?<tr><td colSpan={6}>No provider request touched this tournament in the last 3 days.</td></tr>:null}
        </tbody></table></section>
      <section aria-label="Scheduler decisions"><h2>Scheduler decisions (12 hours)</h2>
        <table className="owner-health-table"><thead><tr><th>Tick</th><th>Status</th><th>Requests</th><th>Feeds for this tournament</th><th>Pacing</th><th>Error</th></tr></thead><tbody>
          {detail.decisions.map((d,n)=><tr key={n}><td>{when(d.startedAt)}</td><td>{d.status}</td><td>{d.requests}</td><td>{d.feeds||'—'}</td><td className="owner-health-evidence">{d.pacing?JSON.stringify(d.pacing):'—'}</td><td>{d.error??'—'}</td></tr>)}
          {!detail.decisions.length?<tr><td colSpan={6}>No tick refreshed this tournament in the last 12 hours.</td></tr>:null}
        </tbody></table></section>
      <section aria-label="Recovery attempts"><h2>Recovery attempts</h2>
        <table className="owner-health-table"><thead><tr><th>When</th><th>Trigger</th><th>Action</th><th>Reason</th><th>Cost</th><th>Outcome</th><th>Next retry</th></tr></thead><tbody>
          {detail.actions.map((a,n)=><tr key={n}><td>{when(String(a.at))}</td><td>{String(a.trigger_source)}</td><td>{String(a.action)}{a.bookmaker?` · ${String(a.bookmaker)}`:''}</td><td className="owner-health-evidence">{String(a.reason)}</td><td>{String(a.request_cost)}</td><td>{String(a.outcome)}</td><td>{a.next_retry_at?when(String(a.next_retry_at)):'—'}</td></tr>)}
          {!detail.actions.length?<tr><td colSpan={7}>No recovery action recorded for this competition.</td></tr>:null}
        </tbody></table></section>
      <section aria-label="Incident history"><h2>Incident history</h2>
        <table className="owner-health-table"><thead><tr><th>Opened</th><th>Severity</th><th>Classification</th><th>State</th><th>Last seen</th><th>Resolved</th><th>Fixtures</th><th>Evidence / resolution</th></tr></thead><tbody>
          {detail.incidents.map(i=><tr key={String(i.id)}><td>{when(String(i.opened_at))}</td><td><span className={stateClass(String(i.severity))}>{String(i.severity)}</span></td><td>{String(i.classification)}</td><td>{String(i.state)}</td><td>{ago(String(i.last_seen_at))}</td><td>{i.resolved_at?when(String(i.resolved_at)):'—'}</td><td>{String(i.affected_fixtures)}</td><td className="owner-health-evidence">{String((i.detail as Record<string,unknown>)?.evidence??'')}{i.resolution?` → ${String(i.resolution)}`:''}</td></tr>)}
          {!detail.incidents.length?<tr><td colSpan={8}>No incident recorded for this competition.</td></tr>:null}
        </tbody></table></section>
    </main>;
}
async function loadCompetition(url:string,competition:string):Promise<{health:ReliabilityHealth;summary:ReliabilityHealth['competitions'][number]|undefined;detail:Awaited<ReturnType<typeof readCompetitionDetail>>|null}|null>{
  const db=new PostgresDatabaseClient(url);
  try{
    const health=await readReliabilityHealth(db);
    const summary=health.competitions.find(c=>c.competition===competition);
    const detail=summary?await readCompetitionDetail(db,competition,summary.tournamentId):null;
    return {health,summary,detail};
  }catch{return null;}finally{await db.close();}
}
