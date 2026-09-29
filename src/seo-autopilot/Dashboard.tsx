import Link from 'next/link';
import type {AutopilotReport} from './report';
const stamp=(v:unknown)=>v?new Date(String(v)).toISOString():'—';
export function AutopilotDashboard({report:r}:{report:AutopilotReport}){
  const max=Math.max(1,...r.trend.map(p=>p.impressions));
  return <main className="owner-health" style={{overflowWrap:'anywhere'}}><header className="owner-health-header"><div><h1>SEO Autopilot</h1>
    <p>Brasil · AutoPublish ON · {r.config.version} · consultas a provedores: 0</p><p><Link href="/owner/growth/seo">Saúde SEO / GSC</Link> · <Link href="/owner/growth/dashboard">Funil comercial completo</Link></p>
    <nav aria-label="Período" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{([7,28,90] as const).map(d=><a key={d} href={`/owner/growth/autopilot?days=${d}`} aria-current={r.days===d?'page':undefined} style={{display:'inline-flex',alignItems:'center',minHeight:44,padding:'0 10px'}}>{d} dias</a>)}</nav></div></header>
    <p>{r.from} a {r.to} · {r.daysObserved}/{r.days} dias com dados. Histórico incompleto não é zero; publicação não comprova crescimento.</p>
    <div className="owner-health-cards">{Object.entries({'Impressões':r.totals.impressions,'Cliques':r.totals.clicks,'CTR':`${(r.totals.ctr*100).toFixed(2)}%`,'Posição média':r.totals.position.toFixed(1),
      'Cliques não-marca':r.nonBrandClicks,'Consultas Top 10':r.top10Queries,'Consultas Top 20':r.top20Queries,'Páginas Top 10':r.top10Pages,'Páginas Top 20':r.top20Pages,
      'URLs submetidas (não indexadas)':String(r.indexable?.submitted_total??'—'),'URLs indexadas':'Não informado pelo GSC','Sessões orgânicas':String(r.organic.sessions),
      'Orgânicas engajadas':String(r.organic.engaged),'Intenção comercial orgânica':String(r.organic.commercial_sessions),'Saídas comerciais orgânicas':String(r.organic.outbound_sessions)}).map(([k,v])=><article className="owner-health-card" key={k}><span>{k}</span><strong>{v}</strong></article>)}</div>
    <p>Não-marca usa somente consultas divulgadas pelo Google. Funil exclui QA, OWNER e BOT; intenção não significa receita ou aposta.</p>
    <section><h2>Impressões diárias</h2><div style={{display:'flex',alignItems:'end',height:150,gap:3}}>{r.trend.map(p=><div key={p.day} title={`${p.day}: ${p.impressions} impressões, ${p.clicks} cliques`} style={{flex:1,background:'var(--accent, #087f5b)',minHeight:2,height:`${p.impressions/max*100}%`}}/>)}</div>
      <details><summary>Dados acessíveis do gráfico</summary>{r.trend.map(p=><p key={p.day}>{p.day}: {p.impressions} impressões · {p.clicks} cliques</p>)}</details></section>
    <section><h2>Oportunidades entre posições 8–20</h2>{r.striking.length?r.striking.map(p=><p key={p.key}><a href={p.key}>{p.key.replace('https://livasports.com','')}</a> · {p.impressions} impressões · posição {p.position.toFixed(1)}</p>):<p>Sem amostra suficiente.</p>}</section>
    <section><h2>Publicação automática e decisões de qualidade</h2><p>Enriquecimento do URL canônico existente — sem novos artigos ou variações de palavra-chave.</p>
      {r.pages.length?r.pages.map(p=><article className="owner-health-card" key={String(p.url)}><a href={String(p.url)}>{String(p.url).replace('https://livasports.com','')}</a>
        <p>{String(p.state)} · Tier {String(p.tier)} · {String(p.score)} pontos</p><p>{(p.reasons as string[]).join(' · ')}</p>
        <p>Publicado: {stamp(p.published_at)} · primeira impressão: {String(p.first_impression??'Ainda não observada')} · cliques: {p.performance?.clicks??'—'} · posição: {p.performance?.position.toFixed(1)??'—'}</p></article>):<p>Aguardando execução inicial.</p>}</section>
    <section><h2>Clusters e feedback semanal</h2><p>Boost máximo +5, não cumulativo, reversível; pesos editoriais originais preservados.</p>{r.clusters.filter(c=>Number(c.boost)>0).map(c=><p key={String(c.cluster)}>{String(c.cluster)}: +{String(c.boost)}</p>)}
      <h3>Ganhos observados — não causalidade comprovada</h3>{r.winners.map(p=><p key={p.key}>{p.key} · {p.impressions} impressões</p>)}
      <h3>Queda: investigar dados, intenção e saúde técnica</h3>{r.decay.map(p=><p key={p.key}>{p.key} · {p.previousImpressions} → {p.impressions} impressões</p>)}
      <h3>CTR: revisar valor factual, nunca clickbait</h3>{r.ctr.slice(0,5).map(p=><p key={p.key}>{p.key} · {(p.ctr*100).toFixed(2)}%</p>)}</section>
    <section><h2>Saúde técnica e sitemap</h2>{r.technical.length?r.technical.map(p=><p key={String(p.url)}>{String(p.url)} · {(p.problems as string[]).join(', ')}</p>):<p>Nenhum problema registrado na amostra. Não equivale a auditoria de todos os URLs.</p>}
      {r.sitemaps.map(s=><p key={String(s.path)}>{String(s.path)} · {String(s.state)} · última submissão: {stamp(s.submitted_at)}{s.error_code?` · ${String(s.error_code)}`:''}</p>)}</section>
    <section><h2>Execuções e auditoria</h2>{r.runs.map(run=><p key={String(run.id)}>{stamp(run.started_at)} · {String(run.state)}</p>)}
      <details><summary>Últimas {r.decisions.length} decisões</summary>{r.decisions.map((d,i)=><article key={i}><p>{stamp(d.created_at)} · {String(d.action)} · {String(d.url)}</p><p>{String(d.reason)}</p></article>)}</details></section>
  </main>;
}
