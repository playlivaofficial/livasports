'use client';
import {useState} from 'react';
import Link from 'next/link';
import {CHANNEL_UTM,VIDEO_CHANNELS} from './config';
import type {GrowthContentItem,GrowthDashboard,RankedGrowthFixture} from './types';
import {PublishingCard,PublishingHistory,publishingDate} from './ManualPublishing';
import {MasterSocial} from './MasterSocial';
import type {PublishingOverview} from './manual-publishing';
import {seoPriority} from './strategy';
import {CORE_GEOS,geoProfile} from '@/config/geo';

type Action=(key:string,body:Record<string,unknown>)=>Promise<void>;
export function latestQueueItems(items:GrowthContentItem[]){
  const latest=new Map<string,GrowthContentItem>();
  for(const item of items){const previous=latest.get(item.fixtureId);if(!item.supersededAt&&(!previous||item.revision>previous.revision))latest.set(item.fixtureId,item);}
  return latest;
}
export function GrowthPriorityCounts({dashboard}:{dashboard:GrowthDashboard}){
  const geo=dashboard.geo??'MX',currentIds=new Set(dashboard.content.map(row=>row.signals.fixtureId));
  const persisted=new Set(dashboard.selection?.current.filter(row=>currentIds.has(row.fixtureId)).map(row=>row.fixtureId)??[]).size;
  return <section className="owner-health-cards" aria-label={`Prioridades actuales · ${geo}`}>
    <article className="owner-health-card"><span>Top 5 actual · {geo}</span><strong>{currentIds.size} / 5</strong><small>Partidos prioritarios, no publicaciones</small></article>
    <article className="owner-health-card"><span>SEO activo · {geo}</span><strong>{persisted}</strong><small>Prioridades actuales en la selección persistida</small></article>
    <article className="owner-health-card"><span>Candidatos elegibles · {geo}</span><strong>{dashboard.producible}</strong><small>{dashboard.considered} partidos evaluados</small></article>
    <article className="owner-health-card"><span>Generación de medios</span><strong>Desactivada</strong><small>Sin video, voz ni imágenes nuevas</small></article>
  </section>;
}
export function GrowthQueue({dashboard:initial}:{dashboard:GrowthDashboard}){
  const [dashboard,setDashboard]=useState(initial),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const geo=dashboard.geo??'MX',profile=geoProfile(geo);
  const act:Action=async(key,body)=>{
    setBusy(key);setMessage('');
    try{const response=await fetch('/api/owner/growth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json() as {error?:string};if(!response.ok){
        const errors:Record<string,string>={ALREADY_POSTED:'Esta versión ya está registrada. Consulta el historial antes de publicar de nuevo.',STALE_OR_UNREADY_ASSET:'El video cambió o todavía no está listo. Actualiza la cola antes de continuar.',POSTING_NOT_ALLOWED:'Este contenido necesita revisión antes de publicarse.',INVALID_POST_URL:'Usa una URL HTTPS válida, sin usuario ni contraseña.',RATE_LIMITED:'Demasiadas acciones seguidas. Espera un minuto e inténtalo de nuevo.'};
        throw new Error(errors[result.error??'']??result.error??'No se pudo completar la acción.');
      }
      const fresh=await fetch(`/api/owner/growth?geo=${geo}`);if(!fresh.ok)throw new Error('Registro guardado; recarga para actualizar la cola.');
      setDashboard(await fresh.json() as GrowthDashboard);setMessage(body.action==='mark-posted'?'Publicación registrada. Historial preservado.':'Actualizado.');
    }catch(error){setMessage(error instanceof Error?error.message:'ACTION_FAILED');}finally{setBusy('');}
  };
  return <main className="owner-health owner-growth">
    <header className="owner-health-header"><div><p className="owner-growth-kicker">LivaSports · Growth por GEO</p><h1>Top 5 · {profile.countryName}</h1>
      <p>Hasta cinco prioridades independientes por país. El mismo motor alimenta descubrimiento, enlaces y SEO; esta selección no genera ni publica medios.</p></div>
      <div className="owner-health-actions"><Link href="/owner/health">Salud</Link><Link href="/owner/analytics">Analytics</Link><Link href="/owner/growth/dashboard">Growth dashboard</Link><Link href="/owner/growth/scorecard">Scorecard semanal</Link>
        <Link href="/owner/growth/authority">Autoridad editorial</Link><button disabled={!!busy} onClick={()=>act('refresh',{action:'refresh',geo})}>{busy==='refresh'?'Actualizando…':'Actualizar Top 5'}</button></div></header>
    <nav className="owner-health-actions" aria-label="GEO de Growth">{CORE_GEOS.map(country=><Link key={country} href={`/owner/growth?geo=${country}`} aria-current={country===geo?'page':undefined}>{geoProfile(country).countryName}</Link>)}</nav>
    <p className="owner-health-notice">Generación de video, voz e imágenes desactivada. Top 5 y SEO siguen activos por GEO. Medios, aprobaciones e historial anteriores permanecen intactos.</p>
    <p className="manual-notice" role="status" aria-live="polite">{busy?'Guardando…':message}</p>
    <GrowthPriorityCounts dashboard={dashboard}/>
    <p>{dashboard.considered} considerados · {dashboard.producible} elegibles · {new Intl.DateTimeFormat(profile.languageTag,{timeZone:profile.timeZone,dateStyle:'short',timeStyle:'short'}).format(new Date(dashboard.generatedAt))} ({profile.timeZone}).</p>
    {!dashboard.publishing?<p role="alert">Historial de publicaciones no disponible. El registro de publicaciones anteriores está temporalmente desactivado; las prioridades por GEO siguen disponibles.</p>:null}
    <section><h2>Top 5 actual</h2><div className="owner-growth-list">{dashboard.content.map((row,index)=><FixtureOpportunity key={row.signals.fixtureId} row={row} rank={index+1} active={dashboard.selection?.current.some(p=>p.fixtureId===row.signals.fixtureId)??false}
      social={dashboard.social.some(item=>item.signals.fixtureId===row.signals.fixtureId)} item={undefined} overview={dashboard.publishing} busy={busy} act={act}/>)}</div>
      {!dashboard.content.length?<p className="owner-health-notice">No hay partidos elegibles en el horizonte actual.</p>:null}</section>
    <details><summary>Rotaciones y Top 5 anterior · {geo}</summary>{dashboard.selection?<><p>Última selección persistida: {dashboard.selection.selectedAt}. Los partidos terminados o movidos se excluyen en la lectura pública.</p><ol>{dashboard.selection.previous.map(row=><li key={row.fixtureId}>{row.label} · #{row.rank} · {row.score}</li>)}</ol><ul>{dashboard.selection.rotations.map(row=><li key={`${row.action}:${row.fixtureId}`}>{row.action}: {row.label} — {row.reason}</li>)}</ul></>:<p>Aún no hay historial persistido para este GEO.</p>}</details>
    <details><summary>Perfil de demanda · evidencia y ajustes semanales</summary><p>Ventanas humanas 7/14/28 días. Mínimo 30 sesiones, 4 días y 3 partidos para cambiar una competición. Ajuste absoluto máximo ±0,12; paso semanal ±0,03. GSC apoya, no define la demanda.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Competición</th><th>Base</th><th>Actual</th><th>Propuesto</th><th>Por qué</th></tr></thead><tbody>{dashboard.demand?.map(d=><tr key={d.competition}><td>{d.competition}</td><td>{d.seed.toFixed(2)}</td><td>{d.previous.toFixed(3)}</td><td>{d.adjustment.toFixed(3)}</td><td>{d.reason}</td></tr>)}</tbody></table></div></details>
    <details className="manual-history"><summary>Publicaciones históricas · todos los GEO, incluido BR</summary>
      <p>Registros anteriores, independientes del Top 5 de {profile.countryName}. Se conservan sus textos y horarios originales de Brasília; estos totales no miden la selección actual.</p>
      {dashboard.publishing?<p>Total histórico: {dashboard.publishing.total} registros · registrados hoy: {dashboard.publishing.today} · últimos 7 días: {dashboard.publishing.last7Days} (Brasília). {VIDEO_CHANNELS.map(channel=>`${CHANNEL_UTM[channel].label}: ${dashboard.publishing?.byPlatform[channel]??0}`).join(' · ')}</p>:null}
      <PublishingHistory key={dashboard.generatedAt} overview={dashboard.publishing}/>
    </details>
    <details className="manual-history"><summary>Producción histórica · estados anteriores y editorial</summary>
      {dashboard.items.map(item=><article key={item.id}><h3>{item.fixture.home.name} vs {item.fixture.away.name} · r{item.revision}</h3>
        <p>{item.creativeVersion??'Legado'} · {publishingDate(item.createdAt)} · {item.supersededAt?'SUPERSEDED':item.trigger}</p>
        <p>{item.channels.map(c=>`${CHANNEL_UTM[c.channel].label}: ${c.status}`).join(' · ')}</p>
        <div className="manual-copy-actions">{item.platformAssets?.filter(a=>a.status==='READY').map(a=><a key={a.channel} href={`/api/owner/growth/items/${item.id}/video/${a.channel}?download=1`}>{CHANNEL_UTM[a.channel].label} · versión histórica</a>)}</div>
      </article>)}<p>Últimos {dashboard.items.length} paquetes. El historial de publicaciones tiene paginación independiente.</p></details>
  </main>;
}
function FixtureOpportunity({row,rank,social,item,overview,busy,act,active}:{row:RankedGrowthFixture;rank:number;social:boolean;item?:GrowthContentItem;overview?:PublishingOverview;busy:string;act:Action;active:boolean}){
  const {signals,priority}=row,seo=seoPriority(row,rank);
  const profile=geoProfile(row.geo??'MX');
  const review=item?<ContentReview item={item} overview={overview} busy={busy} act={act}/>:<p className="owner-health-notice">Prioridad seleccionada para descubrimiento y SEO. No se generarán videos, voz ni imágenes; los medios anteriores se conservan en el historial.</p>;
  return <article className="owner-growth-item"><div className="owner-growth-rank"><span>#{rank}</span><strong>{priority.total}</strong><small>puntos</small>{social?<b>Top 5 · {row.geo??'MX'}</b>:null}</div>
    <div className="owner-growth-main"><header><div><small>{signals.competitionName}</small><h3>{signals.home.name} vs {signals.away.name}</h3><time>{new Intl.DateTimeFormat(profile.languageTag,{timeZone:profile.timeZone,dateStyle:'short',timeStyle:'short'}).format(new Date(signals.kickoff))}</time></div>
      <a href={row.destinationUrl} target="_blank" rel="noreferrer">Abrir destino</a></header>
      <details><summary>Prioridad, SEO y contexto</summary><ul>{priority.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
        <div className="owner-growth-score">{priority.lines.map(line=><span key={line.component}><b>{line.component}</b><em>{line.points}/{line.weight}</em><small>{line.reason}</small></span>)}</div>
        <p>{row.odds.label} — {row.odds.bookmakers.map(book=>book.name).join(', ')}</p>
        <p>{seo.level} · {seo.context}</p><p>{seo.intent.queries.join(' · ')}</p><p>{active?'SEO activo en la selección persistida':'Nuevo candidato; espera la próxima actualización'} · {seo.placements.join(' · ')}</p>
        <p>{row.searchEvidence?.status??'insufficient data'} · GSC: {row.searchEvidence?.impressions??0} impresiones, {row.searchEvidence?.clicks??0} clics, CTR {((row.searchEvidence?.ctr??0)*100).toFixed(1)}%, posición {(row.searchEvidence?.position??0).toFixed(1)}. Dimensión: URL/locale, no país real del visitante.</p>
        <p>{row.bettingEvidence?.reason??'Sin evidencia suficiente de intención de apuesta.'}</p><ul>{row.bettingEvidence?.windows.map(w=><li key={w.days}>{w.days} días: {w.sessions} sesiones humanas · {w.views} vistas · {w.markets} mercados · {w.selections} selecciones · {w.slipAdds} añadidos · {w.comparisons} comparaciones · {w.outbound} salidas afiliadas.</li>)}</ul>
        </details>
      {social?review:<p>Prioridad SEO · sin generación de video, voz ni imágenes. Historial preservado abajo.</p>}
    </div></article>;
}
function ContentReview({item,overview,busy,act}:{item:GrowthContentItem;overview?:PublishingOverview;busy:string;act:Action}){
  const content=item.content,editorial=item.channels.find(c=>c.channel==='EDITORIAL');
  return <div className="owner-growth-copy">
    {content.assetModel==='SOCIAL_V2'?<><p>Mídia histórica · textos e estados separados por plataforma. Verificação automática não equivale à aprovação da plataforma.</p><MasterSocial item={item}/><div className="owner-growth-platforms">{VIDEO_CHANNELS.map(channel=><PublishingCard compact key={`${item.id}:${channel}`} item={item} channel={channel} overview={overview} busy={busy} act={act}/>)}</div></>:<p role="status">blocked_for_review · Pacote anterior sem verificação de política. Preservado no histórico; geração de mídia desativada.</p>}
    {editorial?<details><summary>Social editorial · {editorial.status}</summary><p>{content.captions.EDITORIAL}</p><a href={editorial.trackedUrl} target="_blank" rel="noreferrer">Link editorial</a>
      {editorial.status!=='PUBLISHED'?<div className="manual-copy-actions">{['APPROVED','REJECTED',...(editorial.status==='APPROVED'?['PUBLISHED']:[])].map(status=><button key={status} disabled={!!busy||editorial.status===status} onClick={()=>act(`editorial:${item.id}`,{action:'transition',itemId:item.id,channel:'EDITORIAL',status})}>{status}</button>)}</div>:null}</details>:null}
    <details><summary>Jogadores e direitos</summary>{content.players?.length?content.players.map(p=><p key={p.id}>{p.name}: {p.selectionReason} · {p.media.licenseStatus} · {p.media.commercialEligible?'uso comercial aprovado':'fallback sem retrato'}</p>):<p>Fallback seguro com clubes e personagens Liva.</p>}</details>
  </div>;
}
