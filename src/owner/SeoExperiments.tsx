import type {MetadataExperiment} from '@/seo/experiments';
import type {CtrReport} from '@/seo/ctr-report';
import type {Totals} from '@/seo/intelligence';

const pct=(value:number)=>`${(value*100).toFixed(2)}%`;
const summary=(m:Totals|null)=>m?`${m.clicks} clicks / ${m.impressions} impressions · CTR ${pct(m.ctr)} · position ${m.position.toFixed(1)}`:'Not measured';
function Opportunities({rows}:{rows:CtrReport['pages']}){
  return <div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Page / observed query</th><th>7d measurement</th><th>Country / device</th><th>Review</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.key}><td className="owner-health-evidence"><a href={row.key}>{new URL(row.key).pathname}</a><br/>{row.query??'Query not reported'} · {row.locale}</td>
      <td>{summary(row)}</td><td>{row.country??'Not reported'} / {row.device??'Not reported'}<br/>Brazil: {row.brazilImpressions??'not reported'} · Mobile: {row.mobileImpressions??'not reported'}</td>
      <td>{row.classification}<br/>{row.indexability}</td></tr>)}</tbody></table></div>;
}
/** Only mounted after the existing server-side owner-session guard. No public GSC payload. */
export function SeoExperiments({experiments,opportunities}:{experiments:MetadataExperiment[]|null;opportunities:CtrReport|null}){
  const pending=experiments?.filter(e=>e.windows.some(w=>w.status!=='DESCRIPTIVE_ONLY')).length??0;
  return <section className="seo-experiments" aria-labelledby="seo-experiments-title">
    <h2 id="seo-experiments-title">CTR experiments & Brazil relevance</h2>
    <p>Changes this week: {experiments?.filter(e=>e.changedThisWeek).length??'not measured'} · Awaiting full windows or enough data: {pending}.</p>
    <p className="owner-health-note">Recommendations are not automatic title edits. Fixed 7 / 14 / 28-day windows start after the release day in Pacific time. No automated winner, rollback or causal claim. Google may rewrite snippets; query data may be suppressed.</p>
    {opportunities?<><h3>CTR opportunities · {opportunities.from}–{opportunities.to}</h3>
      <p>Breakdown sync: {opportunities.breakdowns.length?opportunities.breakdowns.map(s=>`${s.dimension} ${s.state}`).join(' · '):'not ingested yet'}.</p>
      <Opportunities rows={opportunities.pages.filter(r=>r.eligible).slice(0,12)}/>
      <h3>Brazil priority opportunities</h3><p>Brazilian teams/competitions, separately from the country of the searcher. Low volume is not proof of a broken page.</p>
      <Opportunities rows={opportunities.pages.filter(r=>r.brazilRelevant).slice(0,12)}/>
      <details><summary>Excluded historic pages / other evidence</summary><Opportunities rows={opportunities.pages.filter(r=>!r.eligible).slice(0,25)}/></details>
    </>:<p role="status">Opportunity measurements unavailable. No zero-data assumption.</p>}
    <h3>Metadata experiments</h3>
    {experiments===null?<p role="status">Experiment storage unavailable.</p>:!experiments.length?<p>No registered metadata changes yet.</p>:experiments.map(experiment=><article key={experiment.id} className="owner-health-card seo-experiment-card">
      <h4><a href={experiment.page}>{new URL(experiment.page).pathname}</a></h4>
      <p>{experiment.queryCluster} · {experiment.reason}</p><p>Changed at: {experiment.changedAt??'Not deployed / observation not started'}</p>
      <p>Frozen 7d baseline: {summary(experiment.baseline['7'].totals)}</p>
      <p>Brazil: {experiment.baseline['7'].brazil?.impressions??'not reported'} impressions · Mobile: {experiment.baseline['7'].mobile?.impressions??'not reported'} impressions.</p>
      <details><summary>Old → new metadata</summary><p>Old title: {experiment.oldTitle}</p><p>New title: {experiment.newTitle}</p><p>Old description: {experiment.oldDescription}</p><p>New description: {experiment.newDescription}</p></details>
      <ul>{experiment.windows.map(window=><li key={window.days}>{window.days}d · {window.status} · {window.from??'pending'}–{window.to??'pending'} · earliest read {window.earliestReadDate??'pending'}
        <p>{summary(window.current)}{window.delta?` · Δ clicks ${window.delta.clicks}, impressions ${window.delta.impressions}, CTR ${window.delta.ctrPercentagePoints.toFixed(2)} pp, position ${window.delta.position.toFixed(1)}`:''}</p></li>)}</ul>
      <p className="owner-health-note">Compare equal-duration windows only. Match expiry/noindex, fixture interest and ranking changes can confound any movement; existing indexability policy is never suspended for an experiment.</p>
    </article>)}
  </section>;
}
