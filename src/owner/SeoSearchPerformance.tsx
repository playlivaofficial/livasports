import type {SeoSearchReport} from '@/seo/report';
import {GeoSearchBaselines} from './GeoSearchBaselines';

const int=(value:number)=>Math.round(value).toLocaleString('en-GB');
const pct1=(value:number)=>`${Math.round(value*1000)/10}%`;
const pos=(value:number)=>value?value.toFixed(1):'—';
const deltaOf=(current:number,previous:number)=>{
  if(!previous)return current?'new':'—';
  const diff=(current-previous)/previous;
  return `${diff>=0?'+':''}${Math.round(diff*1000)/10}%`;
};
const shortUrl=(value:string)=>value.replace(/^https?:\/\/[^/]+/,'')||'/';

/**
 * Live Search Console performance. Rendered only once a real sync has stored rows, so "no data yet" is
 * always visibly different from "zero clicks".
 */
export function SeoSearchPerformance({search}:{search:SeoSearchReport}){
  const {totals7,previous7,totals28,previous28,windows,lastSync,thresholds}=search;
  if(!search.hasData)return <div className="owner-health-card" role="status">
    <span>Search Console</span><strong>CONNECTED · no data stored yet</strong>
    <small>Property {search.property}. The next daily sync ingests {windows.current28.from} → {windows.current28.to}.</small></div>;
  return <>
    <p className="owner-health-note">Property <strong>{search.property}</strong> · complete days only
      (latest final day {windows.latestComplete}) · last sync {lastSync?.finishedAt?.slice(0,16).replace('T',' ')??'—'}Z
      {lastSync?` · ${lastSync.state} · ${lastSync.days} days, ${int(lastSync.rows)} rows${lastSync.truncated?' (row ceiling reached)':''}`:''}
      {' '}· next sync 05:40Z daily.</p>
    <div className="owner-health-cards">
      <div className="owner-health-card"><span>Clicks · 7d</span><strong>{int(totals7.clicks)}</strong>
        <small>{windows.current7.from} → {windows.current7.to} · vs previous {deltaOf(totals7.clicks,previous7.clicks)}</small></div>
      <div className="owner-health-card"><span>Impressions · 7d</span><strong>{int(totals7.impressions)}</strong>
        <small>vs previous {deltaOf(totals7.impressions,previous7.impressions)}</small></div>
      <div className="owner-health-card"><span>CTR · 7d</span><strong>{pct1(totals7.ctr)}</strong>
        <small>clicks ÷ impressions, recomputed across the window</small></div>
      <div className="owner-health-card"><span>Avg position · 7d</span><strong>{pos(totals7.position)}</strong>
        <small>impression-weighted</small></div>
      <div className="owner-health-card"><span>Clicks · 28d</span><strong>{int(totals28.clicks)}</strong>
        <small>vs previous 28d {deltaOf(totals28.clicks,previous28.clicks)}</small></div>
      <div className="owner-health-card"><span>Impressions · 28d</span><strong>{int(totals28.impressions)}</strong>
        <small>vs previous 28d {deltaOf(totals28.impressions,previous28.impressions)}</small></div>
      {search.geo7.map(row=><div key={row.geo} className="owner-health-card"><span>{row.geo} · 7d</span>
        <strong>{row.visitorCountry?`${int(row.visitorCountry.clicks)} country clicks`:'Country: insufficient data'}</strong>
        <small>{row.localeIntent?`${row.locale}: ${int(row.localeIntent.clicks)} clicks / ${int(row.localeIntent.impressions)} impressions`:`${row.locale}: insufficient data`}</small>
      </div>)}
    </div>

    <p className="owner-health-note">Country is Google’s searcher-country dimension; locale intent is the canonical URL path. These are separate measurements, never substitutes. Brazil remains historical reporting only.</p>
    <GeoSearchBaselines baselines={search.geoBaselines??[]}/>
    <h3>Top queries · 7d</h3>
    <table className="owner-health-table"><thead><tr><th>Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead>
      <tbody>{search.topQueries.map(row=><tr key={row.key}><th>{row.key}</th><td>{int(row.clicks)}</td><td>{int(row.impressions)}</td>
        <td>{pct1(row.ctr)}</td><td>{pos(row.position)}</td></tr>)}</tbody></table>

    <h3>Top pages · 7d</h3>
    <table className="owner-health-table"><thead><tr><th>Page</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead>
      <tbody>{search.topPages.map(row=><tr key={row.key}><th className="owner-health-evidence">{shortUrl(row.key)}</th>
        <td>{int(row.clicks)}</td><td>{int(row.impressions)}</td><td>{pct1(row.ctr)}</td><td>{pos(row.position)}</td></tr>)}</tbody></table>

    <h3>Growth pages · 7d vs previous 7d</h3>
    {search.growthPages.length?<table className="owner-health-table">
      <thead><tr><th>Page</th><th>Impr.</th><th>Δ impr.</th><th>Clicks</th><th>Δ pos</th></tr></thead>
      <tbody>{search.growthPages.map(row=><tr key={row.key}><th className="owner-health-evidence">{shortUrl(row.key)}</th>
        <td>{int(row.impressions)}</td><td>{deltaOf(row.impressions,row.previousImpressions)}</td><td>{int(row.clicks)}</td>
        <td>{row.positionChange>=0?`+${row.positionChange.toFixed(1)}`:row.positionChange.toFixed(1)}</td></tr>)}</tbody></table>
      :<p className="owner-health-note">No page cleared the growth threshold ({pct1(thresholds.growth)} impressions, minimum {thresholds.minImpressions}).</p>}

    <h3>Losing visibility · 7d vs previous 7d</h3>
    {search.losingPages.length?<table className="owner-health-table">
      <thead><tr><th>Page</th><th>Impr.</th><th>Was</th><th>Δ</th></tr></thead>
      <tbody>{search.losingPages.map(row=><tr key={row.key}><th className="owner-health-evidence">{shortUrl(row.key)}</th>
        <td>{int(row.impressions)}</td><td>{int(row.previousImpressions)}</td><td>{deltaOf(row.impressions,row.previousImpressions)}</td></tr>)}</tbody></table>
      :<p className="owner-health-note">No material decline against the comparison window.</p>}

    <h3>Near page one · positions {thresholds.nearPageOneFrom}–{thresholds.nearPageOneTo}</h3>
    {search.nearPageOneQueries.length?<table className="owner-health-table">
      <thead><tr><th>Query</th><th>Impr.</th><th>Clicks</th><th>Pos</th></tr></thead>
      <tbody>{search.nearPageOneQueries.map(row=><tr key={row.key}><th>{row.key}</th><td>{int(row.impressions)}</td>
        <td>{int(row.clicks)}</td><td>{pos(row.position)}</td></tr>)}</tbody></table>
      :<p className="owner-health-note">Nothing in that band above {thresholds.minImpressions} impressions.</p>}

    <h3>CTR opportunities</h3>
    <p className="owner-health-note">Expected CTR by position is a transparent in-house <em>heuristic</em>, not a Google
      benchmark. It is used only to rank which queries have the most clicks at stake.</p>
    {search.ctrOpportunities.length?<table className="owner-health-table">
      <thead><tr><th>Query</th><th>Impr.</th><th>CTR</th><th>Heuristic</th><th>Clicks at stake</th></tr></thead>
      <tbody>{search.ctrOpportunities.map(row=><tr key={row.key}><th>{row.key}</th><td>{int(row.impressions)}</td>
        <td>{pct1(row.ctr)}</td><td>{pct1(row.expected)}</td><td>{row.gap.toFixed(1)}</td></tr>)}</tbody></table>
      :<p className="owner-health-note">No query sits under its heuristic band.</p>}

    <h3>Locales · 7d</h3>
    <p className="owner-health-note">Locale comes from our own canonical URL tree (/mx, /co, /pe; historical /br and /en), not from Google&apos;s country dimension.</p>
    <table className="owner-health-table"><thead><tr><th>Locale</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead>
      <tbody>{search.locales7.map(row=><tr key={row.locale}><th>{row.locale}</th><td>{int(row.clicks)}</td><td>{int(row.impressions)}</td>
        <td>{pct1(row.ctr)}</td><td>{pos(row.position)}</td></tr>)}</tbody></table>

    <h3>Devices · 7d</h3>
    <table className="owner-health-table"><thead><tr><th>Device</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead>
      <tbody>{search.devices7.map(row=><tr key={row.key}><th>{row.key}</th><td>{int(row.clicks)}</td><td>{int(row.impressions)}</td>
        <td>{pct1(row.ctr)}</td><td>{pos(row.position)}</td></tr>)}</tbody></table>

    {search.sitemaps.length?<>
      <h3>Search Console sitemap metadata</h3>
      <p className="owner-health-note">Submitted is how many URLs Google read from each sitemap. It is <strong>not</strong> an
        indexed count: the Page Indexing report (Discovered / Crawled – currently not indexed) has no public API.</p>
      <table className="owner-health-table"><thead><tr><th>Sitemap</th><th>Submitted</th><th>Indexed</th><th>Errors</th><th>Warnings</th></tr></thead>
        <tbody>{search.sitemaps.map(row=><tr key={row.path}><th className="owner-health-evidence">{shortUrl(row.path)}</th>
          <td>{int(row.submitted)}</td><td>{row.indexed===null?'not reported':int(row.indexed)}</td>
          <td>{row.errors}</td><td>{row.warnings}</td></tr>)}</tbody></table></>:null}
  </>;
}
