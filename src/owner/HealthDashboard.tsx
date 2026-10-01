'use client';
import {useMemo,useState,type FormEvent} from 'react';
import type {ReliabilityHealth,CompetitionReliability} from '@/odds/reliability/read';
import {cardClass,stateClass,healthRelativeTime} from './health-ui';

type Action='recheck'|'refresh-target'|'retry-mapping'|'acknowledge';
async function ownerHealthAction(body:Record<string,unknown>){
  const response=await fetch('/api/owner/health',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(json.error==='RATE_LIMITED'?'A targeted refresh already ran in the last 5 minutes. Please wait.':json.error==='CONFIRMATION_REQUIRED'?'Confirmation required.':json.error==='UNAUTHORIZED'?'Owner session expired. Sign in again.':json.error==='BUDGET_HEADROOM'||json.code==='BUDGET_HEADROOM'?'Provider budget headroom is too low for a targeted refresh right now.':json.code==='MIN_INTERVAL'?'This competition was refreshed less than 15 minutes ago.':json.code==='CONCURRENT_REFRESH'?'A refresh is already running. Try again in a minute.':`Action failed (${json.error??json.code??response.status}).`);
  return json;
}
export function useOwnerHealthActions(){
  const [busy,setBusy]=useState<Action|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function run(action:Action,extra:Record<string,unknown>={},reload=true){
    setBusy(action);setError('');setMessage('');
    try{const json=await ownerHealthAction({action,...extra});
      setMessage(action==='recheck'?`Re-check complete: overall ${json.overall}, ${json.opened} opened, ${json.resolved} resolved.`:action==='retry-mapping'?`Mapping retried: ${json.mapped} mapped, ${json.unmatched} unmatched, ${json.ambiguous} ambiguous.`:action==='acknowledge'?'Incident acknowledged.':`Targeted refresh ${json.code}: ${json.requests} request(s), headroom after ${json.budgetHeadroomAfter}.`);
      if(reload)setTimeout(()=>window.location.reload(),900);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(null);}
  }
  return {busy,message,error,run};
}
const pct=(v:number)=>`${v.toFixed(v%1?1:0)}%`;

export function OwnerHealthLogin({configured,title='Owner health',subtitle='Odds reliability control plane · owner access only'}:{configured:boolean;title?:string;subtitle?:string}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,key=new FormData(form).get('key');form.reset();setBusy(true);setError('');
    try{const response=await fetch('/api/owner/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',key}),cache:'no-store'});
      if(!response.ok)throw Error(response.status===401?'Access key is invalid.':response.status===429?'Too many failed attempts. Wait 15 minutes.':'Owner sign-in is temporarily unavailable.');
      window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}
  return <main className="owner-preview-page owner-health-login"><h1>{title}</h1><p>{subtitle}</p>
    {!configured?<p>Owner access has not been configured.</p>:<form onSubmit={login}><label htmlFor="owner-key">Private owner access key</label><input id="owner-key" name="key" type="password" autoComplete="current-password" required maxLength={128}/><button disabled={busy}>Sign in</button></form>}
    {error?<p role="alert">{error}</p>:null}</main>;
}

export function OwnerHealthDashboard({health}:{health:ReliabilityHealth}){
  // Snapshot-relative times must be identical during SSR and hydration.
  const {ago,until}=healthRelativeTime(health.generatedAt);
  const {busy,message,error,run}=useOwnerHealthActions();
  const [filter,setFilter]=useState<'ALL'|'UNHEALTHY'|'CRITICAL'|'DEGRADED'|'HEALTHY'|'IDLE'>('UNHEALTHY');
  const [horizon,setHorizon]=useState<'24h'|'3d'|'7d'|'14d'>('7d');
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<'health'|'kickoff'|'coverage'>('health');
  const rows=useMemo(()=>{
    const rank:Record<string,number>={CRITICAL:6,UNMAPPED:5,DEGRADED:4,UNKNOWN:3,UPSTREAM_UNAVAILABLE:2,HEALTHY:1,IDLE:0};
    return health.competitions.filter(c=>filter==='ALL'||(filter==='UNHEALTHY'?c.health!=='HEALTHY'&&c.health!=='IDLE':filter==='CRITICAL'?c.health==='CRITICAL'||c.health==='UNMAPPED':filter==='DEGRADED'?c.health==='DEGRADED'||c.health==='UNKNOWN'||c.health==='UPSTREAM_UNAVAILABLE':c.health===filter))
      .filter(c=>!query||c.competition.includes(query.toLowerCase()))
      .filter(c=>horizon==='14d'||c.windows[horizon].fixtures>0||c.health==='IDLE')
      .sort((a,b)=>sort==='health'?rank[b.health]-rank[a.health]||(Date.parse(a.nearestKickoff??'')||Infinity)-(Date.parse(b.nearestKickoff??'')||Infinity)
        :sort==='kickoff'?(Date.parse(a.nearestKickoff??'')||Infinity)-(Date.parse(b.nearestKickoff??'')||Infinity)
        :a.windows[horizon].anyOddsPct-b.windows[horizon].anyOddsPct);
  },[health,filter,query,horizon,sort]);
  const openIncidents=health.incidents.filter(i=>i.state!=='RESOLVED');
  const budget=health.budget;
  return <main className="owner-health">
    <header className="owner-health-header"><div><h1>LivaSports odds health</h1><p>Generated {ago(health.generatedAt)} · contract {health.version} · provider requests on this page: 0</p></div>
      <div className="owner-health-actions"><button disabled={busy!==null} onClick={()=>void run('recheck')}>Re-check health</button><button disabled={busy!==null} onClick={()=>void run('retry-mapping')}>Retry catalog mapping</button><a href="/owner/growth">Traffic Engine</a><a href="/owner/preview">Owner preview</a></div></header>
    {message?<p className="owner-health-notice" role="status">{message}</p>:null}{error?<p className="owner-health-notice" role="alert">{error}</p>:null}
    <section className="owner-health-cards" aria-label="Summary">
      <div className={cardClass(health.overall)}><span>Overall</span><strong>{health.overall}</strong><small>{health.counts.CRITICAL+health.counts.UNMAPPED} critical · {health.counts.DEGRADED+health.counts.UNKNOWN} degraded · {health.counts.HEALTHY} healthy</small></div>
      <div className="owner-health-card"><span>Next 24h</span><strong>{pct(health.horizons['24h'].anyOddsPct)}</strong><small>{health.horizons['24h'].anyOdds}/{health.horizons['24h'].fixtures} fixtures priced{health.horizons['24h'].criticalCompetitions.length?` · critical: ${health.horizons['24h'].criticalCompetitions.join(', ')}`:''}</small></div>
      <div className="owner-health-card"><span>Next 3d</span><strong>{pct(health.horizons['3d'].anyOddsPct)}</strong><small>{health.horizons['3d'].anyOdds}/{health.horizons['3d'].fixtures} fixtures priced{health.horizons['3d'].criticalCompetitions.length?` · critical: ${health.horizons['3d'].criticalCompetitions.join(', ')}`:''}</small></div>
      {health.fourSource?.windows['7d'].sources.map(source=><div className="owner-health-card" key={source.bookmaker}><span>{source.name} {source.role==='HIDDEN_INSURANCE'?'insurance':'REAL'} (7d)</span><strong>{source.currentFixtures}/{health.fourSource!.windows['7d'].fixtures}</strong><small>MW {source.markets.MATCH_WINNER} · OU2.5 {source.markets.TOTAL_GOALS} · BTTS {source.markets.BTTS}</small></div>)}
      <div className="owner-health-card"><span>Proxy usage (7d)</span><strong>{pct(health.fourSource?.windows['7d'].proxyPct??health.bookmakers.proxyPct)}</strong><small>Displayed exact selections; hidden insurance is not REAL target coverage.</small></div>
      <div className="owner-health-card"><span>Stale / expired</span><strong>{health.quoteAges.staleQuotes} / {health.quoteAges.expiredQuotes}</strong><small>quote age p50 {health.quoteAges.p50Minutes??'—'} min · p95 {health.quoteAges.p95Minutes??'—'} min · oldest {health.quoteAges.oldestMinutes??'—'} min</small></div>
      <div className={`owner-health-card ${budget?.pressure==='EXHAUSTED'||!health.budgetVerified?'owner-health-state-critical':budget?.quotaState!=='NORMAL'?'owner-health-state-degraded':''}`}><span>Provider budget</span><strong>{budget?`${budget.used} / ${budget.routineAllowance}`:'unverified'}</strong><small>{budget?`${budget.routineRemaining} left · ${budget.remainingDays} d · rolling 24h ${budget.rollingDay}/${budget.dailyCap} (${budget.utilizationPct}%) · UTC today ${budget.requestsTodayUtc??0}, projected ${budget.projectedEndOfDayUsage??0} at day end · automatic stop ${budget.normalStop}, controlled stop ${budget.controlledStop} · remaining daily allowance ${budget.headroom} · ${budget.quotaState} · historical projection ${budget.projectedDailyRequests}/day → ${budget.projectedEndOfPeriodUsage} at period end${budget.projectedOverrun?' ⚠ overrun':''}`:'No verified subscription period'}</small></div>
      <div className={`owner-health-card ${health.global.some(g=>g.classification==='SCHEDULER_STALLED')?'owner-health-state-critical':''}`}><span>Scheduler</span><strong>{health.scheduler.state}</strong><small>last tick {ago(health.scheduler.lastAutomaticInvocationAt)} · last success {ago(health.scheduler.lastSuccessfulRefreshAt)} · next due {until(health.scheduler.nextDueAt)}{health.scheduler.lastError?` · ${health.scheduler.lastError}`:''}</small></div>
      <div className={`owner-health-card ${health.catalog.unmatched+health.catalog.ambiguous?'owner-health-state-degraded':''}`}><span>Catalog</span><strong>{health.catalog.unmatched+health.catalog.ambiguous} unmatched</strong><small>{health.catalog.mapped} mapped · {health.catalog.ambiguous} ambiguous · {health.catalog.ignored} outside registry · alerts: {health.alerting.email==='CONFIGURED'?'dashboard + e-mail':'dashboard only (OWNER_ALERT_EMAIL not set)'}</small></div>
    </section>
    {health.dataPlane?<section aria-label="Refresh data plane"><h2>Control plane ≠ data plane</h2>
      <p>Scheduler execution: {health.controlPlane?.state??'UNKNOWN'} · Public native data: {health.dataPlane.state} · Maximum overdue: {health.dataPlane.maxOverdueMinutes} min · provider requests on this read: 0</p>
      <p>Hidden Betano insurance is reported separately. A completed cron or a stored suspended price is not proof of usable public native coverage. Competitions outside the seven-day odds window remain visible but do not generate overdue alerts.</p>
      <details><summary>All competition / bookmaker refresh targets ({health.dataPlane.targets.length})</summary><div className="owner-health-scroll"><table className="owner-health-table">
        <thead><tr><th>Competition</th><th>Bookmaker / role</th><th>Fixtures</th><th>State / responsibility</th><th>Last attempt</th><th>Verified success</th><th>Native persist</th><th>Due / stale after</th><th>Retry / queue</th><th>Reason</th></tr></thead>
        <tbody>{health.dataPlane.targets.map(t=><tr key={`${t.competition}:${t.bookmaker}`}><td>{t.competition}</td><td>{t.bookmaker}{t.hiddenInsurance?' · hidden insurance':' · public'}</td><td>{t.fixtures}</td><td>{t.state} / {t.responsibility}</td><td>{ago(t.lastAttemptAt)}</td><td>{ago(t.lastSuccessAt)}</td><td>{ago(t.lastNativePersistAt)}</td><td>{t.nextDueAt??'outside window'} / {t.staleAfter??'—'}</td><td>{t.retryAfter??'—'} / {t.queueState}</td><td>{t.staleReason??'—'}</td></tr>)}</tbody>
      </table></div></details>
    </section>:null}
    <section><h2>Native freshness continuity</h2><p>Platform: {health.platformHealth??'UNKNOWN'} · Upstream coverage: {health.upstreamCoverageHealth??'UNKNOWN'}</p>
      <p>Sampled selection-time over 24 hours, not wall-clock downtime. Gaps longer than 15 minutes are excluded. Retention measures native selections still native at the next observation; intra-sample changes may be unobserved.</p>
      <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Bookmaker / cohort</th><th>Native time</th><th>Native retention</th><th>Fallback selection-minutes</th><th>Native → fallback</th><th>Recovered</th><th>Expiry misses</th></tr></thead><tbody>
        {health.continuity?.groups.filter(g=>g.key==='*'||g.key.endsWith('|*|*|*')).map(g=><tr key={g.key}><td>{g.key}</td><td>{g.nativeContinuityPct?.toFixed(1)??'—'}%</td><td>{g.nativeRetentionPct?.toFixed(1)??'—'}%</td><td>{Math.round(g.fallbackSeconds/60)}</td><td>{g.nativeToFallback}</td><td>{g.recoveries}</td><td>{g.expiryMisses}</td></tr>)}
      </tbody></table></div><p>{health.continuity?.samples??0} samples · Rescue batches with fresh native after persistence: {health.continuity?.rescue.success??0}/{health.continuity?.rescue.attempts??0} · Rescue queue: {health.continuity?.rescueQueue.length??0}</p>
      <details><summary>Expiry queues, precise deferrals, source health and all continuity cohorts</summary><pre>{JSON.stringify({expiries:health.nativeCoverage?.expiries,delays:health.nativeCoverage?.delayCounts,sources:health.nativeCoverage?.sourceHealth,continuity:health.continuity},null,2)}</pre></details>
    </section>
    {health.nativeCoverageError?<p role="alert">Native coverage diagnostics unavailable — not a healthy result.</p>:null}
    {health.nativeCoverage?<section><h2>Native coverage · continuous DB-only audit</h2><p>{health.nativeCoverage.fixtures} eligible fixtures · {health.nativeCoverage.pipelineLoss} lost native selections · {health.nativeCoverage.unresolvedIdentities} unresolved identities · {health.nativeCoverage.regressions.length} rolling regressions · {health.nativeCoverage.baselineSamples} baseline samples · provider requests: 0</p>
      <details><summary>Bookmaker / competition / market / kickoff-window breakdown</summary><div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Bookmaker</th><th>Competition</th><th>Market / window</th><th>Native / eligible</th><th>Complete native</th><th>Fallback</th><th>Unavailable</th><th>Missing-native reasons (selections)</th></tr></thead><tbody>{health.nativeCoverage.groups.map(g=><tr key={g.key}><th>{g.bookmaker}</th><td>{g.competition}</td><td>{g.market} / {g.window}</td><td>{g.native}/{g.eligible} ({pct(g.nativePct)})</td><td>{g.complete}</td><td>{g.fallback} ({pct(g.fallbackPct)})</td><td>{g.unavailable}</td><td>{Object.entries(g.reasons).filter(([,n])=>n).map(([reason,n])=>`${reason}: ${n}`).join(' · ')||'—'}</td></tr>)}</tbody></table></div></details>
      <details><summary>Regression evidence and exact per-selection diagnostics</summary><pre>{JSON.stringify({regressions:health.nativeCoverage.regressions,cells:health.nativeCoverage.cells.filter(c=>c.reason),diagnostics:health.nativeCoverage.diagnostics},null,2)}</pre></details>
    </section>:null}
    {health.fourSource?<details><summary>Four-source coverage and insurance breakdown</summary>{(['24h','3d','7d'] as const).map(window=>{const data=health.fourSource!.windows[window];return <section key={window}><h2>{window} · {data.fixtures} fixtures</h2><p>3 visible REAL: {data.visibleReal.three} · 2 REAL: {data.visibleReal.two} · 1 REAL: {data.visibleReal.one} · no visible REAL: {data.visibleReal.none}</p><div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Target</th><th>Own REAL</th><th>Betano used</th><th>Betano failed</th><th>Alternate used</th><th>No insurance</th><th>Proxy %</th></tr></thead><tbody>{data.targets.map(t=><tr key={t.bookmaker}><th>{t.bookmaker}</th><td>{t.real}</td><td>{t.BETANO_INSURANCE_USED}</td><td>{t.BETANO_INSURANCE_FAILED}</td><td>{t.ALTERNATE_INSURANCE_USED}</td><td>{t.NO_INSURANCE_AVAILABLE}</td><td>{pct(t.real+t.proxy?t.proxy/(t.real+t.proxy)*100:0)}</td></tr>)}</tbody></table></div></section>;})}</details>:null}
    {health.global.length?<section className="owner-health-global" aria-label="Platform alerts">{health.global.map(g=><p key={g.classification} className={stateClass(g.severity)}><strong>{g.classification}</strong> — {g.evidence}</p>)}</section>:null}
    <section aria-label="Open incidents"><h2>Open incidents ({openIncidents.length})</h2>
      {openIncidents.length?<table className="owner-health-table"><thead><tr><th>Severity</th><th>Scope</th><th>Classification</th><th>Opened</th><th>Last seen</th><th>Fixtures</th><th>Evidence</th><th>Alert</th><th></th></tr></thead><tbody>
        {openIncidents.map(i=><tr key={i.id}><td><span className={stateClass(i.severity)}>{i.severity}</span></td><td>{i.competition==='*'?'platform':<a href={`/owner/health/${i.competition}`}>{i.competition}</a>}</td><td>{i.classification}</td><td>{ago(i.openedAt)}</td><td>{ago(i.lastSeenAt)}</td><td>{i.affectedFixtures}</td><td className="owner-health-evidence">{String(i.detail.evidence??'')}</td><td>{i.alertChannel??'—'}</td><td>{i.state==='OPEN'?<button disabled={busy!==null} onClick={()=>void run('acknowledge',{incidentId:i.id})}>Acknowledge</button>:'acknowledged'}</td></tr>)}
      </tbody></table>:<p>No open incidents.</p>}
    </section>
    <section aria-label="Competitions"><h2>Competitions</h2>
      <div className="owner-health-filters">
        <label>Health <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="UNHEALTHY">Unhealthy</option><option value="ALL">All</option><option value="CRITICAL">Critical / unmapped</option><option value="DEGRADED">Degraded / unknown / upstream</option><option value="HEALTHY">Healthy</option><option value="IDLE">Idle</option></select></label>
        <label>Horizon <select value={horizon} onChange={e=>setHorizon(e.target.value as typeof horizon)}><option value="24h">24 h</option><option value="3d">3 d</option><option value="7d">7 d</option><option value="14d">14 d</option></select></label>
        <label>Sort <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="health">Health (worst first)</option><option value="kickoff">Next kickoff</option><option value="coverage">Coverage (lowest first)</option></select></label>
        <label>Competition <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="filter by slug"/></label>
      </div>
      <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Competition</th><th>Health</th><th>Next kickoff</th><th>24h</th><th>3d</th><th>7d</th><th>MW</th><th>OU2.5</th><th>BTTS</th><th>Betano</th><th>Betsson</th><th>Proxy</th><th>Neither</th><th>Last refresh</th><th>Target</th><th>Provider</th><th>Issue</th></tr></thead><tbody>
        {rows.map((c:CompetitionReliability)=>{const w=c.windows[horizon];return <tr key={c.competition}><td><a href={`/owner/health/${c.competition}`}>{c.competition}</a></td><td><span className={stateClass(c.health)}>{c.health}</span></td><td>{until(c.nearestKickoff)}</td>
          <td>{c.windows['24h'].anyOdds}/{c.windows['24h'].fixtures}</td><td>{c.windows['3d'].anyOdds}/{c.windows['3d'].fixtures}</td><td>{c.windows['7d'].anyOdds}/{c.windows['7d'].fixtures}</td>
          <td>{pct(w.matchWinnerPct)}</td><td>{pct(w.totalGoals25Pct)}</td><td>{pct(w.bttsPct)}</td><td>{pct(w.betanoRealPct)}</td><td>{pct(w.betssonRealPct)}</td><td>{pct(w.proxyPct)}</td><td>{pct(w.neitherPct)}</td>
          <td>{ago(c.lastSuccessAt)}</td><td>{c.targetState}</td><td>{c.providerState}</td><td>{c.primary??(c.notes.length?'note':'—')}</td></tr>;})}
        {!rows.length?<tr><td colSpan={17}>No competitions match this filter.</td></tr>:null}
      </tbody></table></div>
    </section>
    {health.catalog.rows.length?<section aria-label="Unmatched catalog rows"><h2>Provider catalog rows needing a mapping decision ({health.catalog.rows.length})</h2>
      <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Provider ID</th><th>Slug</th><th>Name / normalized</th><th>Category</th><th>State / confidence</th><th>Candidate</th><th>Reason</th><th>Future fixtures</th><th>First / last seen</th><th>Observations</th></tr></thead><tbody>
        {health.catalog.rows.map(r=><tr key={r.tournamentId}><td>{r.tournamentId}</td><td>{r.slug}</td><td>{r.name}<br/>{r.normalizedName}</td><td>{r.category}</td><td>{r.state}<br/>{r.confidence}</td><td>{r.competition??r.candidates?.join(', ')??'—'}</td><td>{r.reason}</td><td>{r.futureFixtures??'—'}</td><td>{ago(r.firstSeenAt??null)} / {ago(r.lastSeenAt)}</td><td>{r.occurrences??1}</td></tr>)}
      </tbody></table></div></section>:null}
    <section aria-label="Recovery actions"><h2>Automatic recovery log (latest {health.recovery.length})</h2>
      <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>When</th><th>Trigger</th><th>Action</th><th>Scope</th><th>Reason</th><th>Cost</th><th>Outcome</th><th>Next retry</th><th>Headroom after</th></tr></thead><tbody>
        {health.recovery.map(a=><tr key={a.id}><td>{ago(a.at)}</td><td>{a.trigger}</td><td>{a.action}</td><td>{a.competition??''}{a.bookmaker?` · ${a.bookmaker}`:''}{a.tournamentId?` · ${a.tournamentId}`:''}</td><td className="owner-health-evidence">{a.reason}</td><td>{a.requestCost}</td><td>{a.outcome}</td><td>{a.nextRetryAt?until(a.nextRetryAt):'—'}</td><td>{a.budgetRemainingAfter??'—'}</td></tr>)}
        {!health.recovery.length?<tr><td colSpan={9}>No recovery actions recorded yet.</td></tr>:null}
      </tbody></table></div>
    </section>
    <footer className="owner-health-footer"><p>Runbook: <code>docs/ODDS_RELIABILITY_SLO.md</code> · Health API: <code>GET /api/owner/health</code> (owner session) · <code>GET /api/internal/odds-health</code> (cron secret)</p></footer>
  </main>;
}

export function CompetitionActions({competition,canRefresh,requestCost}:{competition:string;canRefresh:boolean;requestCost:number}){
  const {busy,message,error,run}=useOwnerHealthActions();
  const [confirming,setConfirming]=useState(false);
  return <div className="owner-health-actions">
    {!confirming?<button disabled={busy!==null||!canRefresh} onClick={()=>setConfirming(true)}>Targeted refresh…</button>
      :<span className="owner-health-confirm">This consumes up to {requestCost} provider request(s) (both bookmakers, this competition only). <button disabled={busy!==null} onClick={()=>{setConfirming(false);void run('refresh-target',{competition,confirm:true});}}>Confirm</button><button disabled={busy!==null} onClick={()=>setConfirming(false)}>Cancel</button></span>}
    <button disabled={busy!==null} onClick={()=>void run('recheck')}>Re-check health</button>
    {message?<span role="status">{message}</span>:null}{error?<span role="alert">{error}</span>:null}
  </div>;
}
