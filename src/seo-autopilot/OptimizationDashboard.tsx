import type {readOptimizationReport} from './optimization-report';
type Report=Awaited<ReturnType<typeof readOptimizationReport>>;
const stamp=(v:unknown)=>v?new Date(String(v)).toISOString():'—';
export function OptimizationDashboard({report:r}:{report:Report}){
  if(!r)return <section><h2>Growth Optimization V2.1</h2><p>OBSERVE_ONLY — aguardando migração/medição. A publicação V2 continua protegida.</p></section>;
  const e=r.evidence;
  return <section data-growth-optimization="v2.1" style={{minWidth:0,overflowWrap:'anywhere'}}>
    <h2>Growth Optimization Loop V2.1</h2><p><strong>{e.mode}</strong> · {e.reasons.join(' · ')||'Dados completos; ações individuais ainda exigem evidência e controles.'}</p>
    <p>{e.observedDays} dias observados · GSC final até {e.to}. Consultas anônimas/indefinidas não são tratadas como não-marca.</p>
    <p>Metadados: {e.mode==='ACTIVE'&&e.opportunities.some(o=>o.proposedAction==='TITLE_PATTERN'&&o.confidence==='HIGH')?'candidatos HIGH ainda sujeitos a controle/qualidade':'OBSERVE_ONLY — nenhuma reescrita sem evidência HIGH'}</p>
    <div className="owner-health-cards">{([['7 dias',e.metrics7],['28 dias',e.metrics28]] as const).map(([label,m])=><article className="owner-health-card" key={label}>
      <h3>{label}</h3><p>{m.impressions} impressões · {m.clicks} cliques · CTR {(m.ctr*100).toFixed(2)}%</p>
      <p>{m.nonBrandClicks} cliques não-marca · {m.unknownQueryClicks} sem classificação segura</p><p>Top 10: {m.top10Pages} páginas / {m.top10Queries} consultas · Top 20: {m.top20Pages} / {m.top20Queries}</p>
    </article>)}</div>
    <p>Limites/dia: {e.config.maxAutomaticTitleChangesPerDay} título, {e.config.maxAutomaticMetaChangesPerDay} descrição, {e.config.maxAutomaticLinkBoostsPerDay} links. Metadados: HIGH, {e.config.minimumImpressionsForTitleTest} impressões, {e.config.minimumHighConfidenceDays} dias por janela, cooldown {e.config.metadataCooldownDays} dias. Sem promessa de crescimento.</p>
    {([['STRIKING_DISTANCE','Distância da primeira página'],['LOW_CTR','CTR abaixo de pares comparáveis'],['WINNING_PAGE','Páginas e clusters em crescimento'],['DECAYING_WINNER','Quedas: diagnóstico antes da mudança'],['LOW_VALUE','Baixo valor observado: prioridade futura, não exclusão']] as const).map(([kind,label])=>{
      const rows=e.opportunities.filter(o=>o.detector===kind).slice(0,12);return <section key={kind}><h3>{label}</h3>{rows.length?rows.map(o=><article className="owner-health-card" key={o.url}>
        <a href={o.url}>{o.url.replace('https://livasports.com','')}</a><p>{o.query??'Consulta relevante ainda não comprovada'} · {o.evidence.type} · {o.confidence}</p>
        <p>{o.evidence.current.impressions} impressões · posição {o.evidence.current.position.toFixed(1)} · CTR {(o.evidence.current.ctr*100).toFixed(2)}% · {o.cohortSize} pares</p>
        <p>{o.proposedAction} — {o.reason}</p><details><summary>Por quê / contexto e evidência</summary><p>Publicado: {stamp(o.evidence.publishedAt)} · última mudança: {stamp(o.evidence.lastChangedAt)} · primeira impressão: {o.evidence.firstObserved??'—'}</p>
          <p>Cluster: {o.evidence.cluster??'Não mapeado para automação'} · entidade: {o.evidence.entityId??'—'} · {o.evidence.current.days} dias por página · comparação anterior: {o.evidence.previous.days} dias</p>
          <p>Freshness: {String(o.evidence.fresh)} · saúde técnica: {String(o.evidence.technicalHealthy)} · experimento protegido: {String(o.evidence.activeExperiment)}</p></details>
      </article>):<p>Sem evidência qualificada. Ausência de evidência não significa ausência de potencial.</p>}</section>;
    })}
    <h3>Mudanças automáticas / decisões retidas</h3>{r.actions.length?r.actions.map(a=><details key={String(a.id)}><summary>{stamp(a.created_at)} · {String(a.action)} · {String(a.outcome)} · {String(a.confidence)}</summary><p>{String(a.url)}</p><p>{String(a.reason)}</p>
      <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({before:a.previous_value,after:a.new_value,evidence:a.evidence},null,2)}</pre></details>):<p>Nenhuma mudança automática aplicada. Histórico jovem não força testes.</p>}
    <h3>Experimentos e resultados 7 / 14 / 28 dias</h3><p>Controles comparáveis e atribuição determinística. Sinais descritivos não provam causalidade; freeze exige revisão, nunca oscilação automática.</p>
    {r.experiments.length?r.experiments.map(x=><article className="owner-health-card" key={String(x.id)}><p>{String(x.kind)} · {String(x.state)} · início {stamp(x.started_at)}</p><p>Variante: {String(x.page)}</p><p>Controle: {String(x.control_page)}</p>
      {([7,14,28] as const).map(d=>{const o=r.observations.find(o=>o.experiment_id===x.id&&Number(o.window_days)===d);return <p key={d}>{d} dias: {o?String(o.assessment):'Aguardando janela completa/amostra'}</p>;})}
      {x.state==='FROZEN'?<p>Revisão necessária; sem novas alterações. Cooldown mínimo até {stamp(x.frozen_until)}.</p>:null}</article>):<p>Nenhum experimento iniciado sem amostra e controle qualificados.</p>}
    <h3>Pesos futuros / revisão semanal</h3><p>Ajuste de prioridade no mesmo dia de manutenção: −3 a +3, passo máximo 1/semana; não altera scoring editorial, qualidade ou elegibilidade. Sinais expiram em 14 dias.</p>
    <p>Novas entradas Top 10: {e.top10Entrants??'janela anterior incompleta'} · Top 20: {e.top20Entrants??'janela anterior incompleta'}</p>
    {r.weekly.map(w=><details key={String(w.week)}><summary>Revisão semanal {String(w.week)}</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(w.report,null,2)}</pre></details>)}
    {r.weights.map(w=><p key={String(w.cluster)}>{String(w.cluster)}: {String(w.adjustment)} · semana {String(w.evaluated_week)} · {String((w.evidence as {reason?:string})?.reason??'')}</p>)}
    <h3>Qualidade de conversão orgânica</h3><p>Somente atribuição existente, HUMAN; exclui QA/OWNER/BOT. Taxas secundárias, nunca objetivo exclusivo de publicação.</p>
    <p>Sessões {r.quality.sessions} · engajamento {r.quality.engagementRate} · início de comparação {r.quality.comparisonRate} · intenção de afiliado elegível {r.quality.affiliateIntentRate}</p>
    <p>Chamadas a provedores nesta medição/navegação: 0. Nenhuma configuração manual diária necessária.</p>
  </section>;
}
