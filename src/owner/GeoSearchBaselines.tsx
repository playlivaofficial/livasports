import type {GeoSearchBaseline} from '@/seo/geo-baseline';
import type {Totals} from '@/seo/intelligence';

const metrics=(value:Totals|null)=>value?`${value.clicks.toLocaleString('en-GB')} clicks · ${value.impressions.toLocaleString('en-GB')} impressions · ${(value.ctr*100).toFixed(2)}% CTR`:'No complete reported sample';
/** Stored, privacy-limited Google measurements; no prediction or inferred visitor GEO. */
export function GeoSearchBaselines({baselines}:{baselines:GeoSearchBaseline[]}){
 return <section aria-labelledby="geo-search-baselines">
  <h3 id="geo-search-baselines">MX / CO / PE · 7 / 14 / 28-day baselines</h3>
  <p className="owner-health-note">Country = Google searcher country across the site. Regional pages = canonical URL intent. Their intersection and mobile/query reports are separate, privacy-limited dimensions; totals need not reconcile. Windows use a three-day reporting lag. Missing reports are not zero traffic or proof that a page is excluded.</p>
  {!baselines.length?<p role="status">Regional baseline unavailable; existing Search Console reporting remains intact.</p>:baselines.map(b=><article className="geo-search-baseline" key={b.geo}>
   <h4>{b.geo} · /{b.locale} · Google country {b.countryCode}</h4>
   <div className="owner-health-cards">{b.windows.map(w=><div className="owner-health-card" key={w.days}>
    <span>{w.days} days · {w.complete?'complete fetch window':'incomplete fetch coverage'}</span>
    <small>{w.from} → {w.to} · regional rows on {w.observedDays} days</small>
    <strong>Regional pages: {metrics(w.localeIntent)}</strong>
    <small>Searcher country: {metrics(w.visitorCountry)}</small>
    <small>Regional pages × country: {metrics(w.localPagesInCountry)}</small>
    <small>Regional pages × mobile: {metrics(w.mobile)}</small>
    <small>Previous equal-length regional window: {metrics(w.previousLocaleIntent)}</small>
   </div>)}</div>
   <h5>Reported regional queries · 28d</h5>
   {b.windows[2].topQueries.length?<ul>{b.windows[2].topQueries.map(r=><li key={r.key}>{r.key} · {r.clicks} clicks / {r.impressions} impressions · {(r.ctr*100).toFixed(2)}% CTR</li>)}</ul>:<p className="owner-health-note">Insufficient reported query data; no search volumes inferred.</p>}
   <h5>Reported regional landing pages · 28d</h5>
   {b.windows[2].topPages.length?<ul>{b.windows[2].topPages.map(r=><li key={r.key}><a href={r.key}>{new URL(r.key).pathname}</a> · {r.clicks} clicks / {r.impressions} impressions · {(r.ctr*100).toFixed(2)}% CTR · position {r.position.toFixed(1)}</li>)}</ul>:<p className="owner-health-note">Insufficient reported landing-page data.</p>}
  </article>)}
 </section>;
}
