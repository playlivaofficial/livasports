import type {CoreGeo} from '@/config/geo';
import {geoProfile} from '@/config/geo';
import type {DailyGrowthReport} from './daily-repository';

export function DailyGrowthStatus({report,geo}:{report:DailyGrowthReport;geo:CoreGeo}){
 const profile=geoProfile(geo),time=(value:string)=>new Intl.DateTimeFormat(profile.languageTag,{timeZone:profile.timeZone,dateStyle:'short',timeStyle:'short'}).format(new Date(value));
 const metric=(value:number|null|undefined)=>value===null||value===undefined?'Sin filas GSC':value;
 return <section aria-label={`Promoción diaria · ${geo}`}>
  <h2>Top 5 promovido · {profile.countryName}</h2>
  <p>Ranking diario por fecha local y comprobación automática cada hora. Los partidos iniciados, aplazados o cancelados desaparecen de los enlaces públicos inmediatamente; la siguiente comprobación repone los huecos. Sin cambios diarios arbitrarios de títulos ni fechas editoriales.</p>
  <p>Fecha local: {report.localDay} · Último éxito: {report.lastSuccess?time(report.lastSuccess.finishedAt??report.lastSuccess.startedAt):'Aún no registrado'} · Próxima comprobación: {time(report.nextCheck)} ({profile.timeZone}).</p>
  <p>Última comprobación automática: {report.lastSuccess?.lastCheckedAt?time(report.lastSuccess.lastCheckedAt):'Aún no registrada'} · {report.lastSuccess?.checkCount??0} comprobaciones desde esta selección.</p>
  {report.active.length<5?<p role="status">{report.active.length} / 5 prioridades públicas válidas. La próxima comprobación revisará los candidatos disponibles; no se inventan partidos para completar la lista.</p>:null}
  <p>Google: ventana {report.window.from} a {report.window.to}. URL regional y país del buscador se miden por separado. Sin filas significa no disponible, no cero. Sesiones y referencias orgánicas HUMAN: últimos 28 días, sin OWNER/QA/BOT; no prueban crecimiento causado por la promoción.</p>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>#</th><th>Partido</th><th>Puntaje</th><th>Impresiones URL</th><th>Clics URL</th><th>CTR URL</th><th>Posición URL</th><th>Impresiones país</th><th>Clics país</th><th>Sesiones orgánicas</th><th>Referencias orgánicas</th></tr></thead>
   <tbody>{report.active.map(row=>{const m=report.measurements.find(m=>m.fixtureId===row.fixtureId);return <tr key={row.fixtureId}><td>{row.rank}</td><td><a href={row.canonicalUrl}>{row.label}</a><br/><small>{time(row.kickoff)}</small></td><td>{row.score}</td>
    <td>{metric(m?.impressions)}</td><td>{metric(m?.clicks)}</td><td>{m?.impressions?`${((m.clicks??0)/m.impressions*100).toFixed(2)}%`:'—'}</td><td>{m?.position?.toFixed(1)??'—'}</td>
    <td>{metric(m?.countryImpressions)}</td><td>{metric(m?.countryClicks)}</td><td>{m?.organicSessions??0}</td><td>{m?.organicReferrals??0}</td></tr>;})}</tbody></table></div>
  <p>Enlaces de descubrimiento: inicio, página diaria, competición y perfiles de ambos equipos, mediante el mismo Top 5 persistido. Indexabilidad se valida en la página; el estado de indexación en Google requiere inspección y no se deduce de una publicación.</p>
  <details><summary>Historial diario y evidencia de ejecución · {geo}</summary>
   {report.runs.map(run=><article key={run.id}><h3>{run.localDay} · {run.state} · {time(run.startedAt)}</h3><p>{run.trigger==='AUTOMATIC'?'Automática':'Actualización del propietario'} · {run.considered} evaluados · {run.eligible} elegibles · {run.selectedCount} seleccionados · {run.changed?'Lista actualizada':'Sin cambios de lista'}{run.error?` · ${run.error}`:''}</p>
    <p>{run.countryEvidence?.reason??'Sin evidencia de país registrada'}</p>
    <ol>{run.selection.map(row=><li key={row.fixtureId}><a href={row.canonicalUrl}>{row.label}</a> · {row.score} puntos · {time(row.kickoff)}<details><summary>Datos y enlaces de esta selección</summary><p>{row.competition}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({breakdown:row.breakdown,evidence:row.evidence,discoveryPaths:row.discoveryPaths},null,2)}</pre></details></li>)}</ol>
   </article>)}
  </details>
 </section>;
}
