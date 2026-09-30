import type {GscHealth} from '@/seo/gsc-health';

/** Safe scalar evidence only. No credentials, raw API responses or live Google requests. */
export function GscHealthPanel({health}:{health:GscHealth|null}){
  return <section className="owner-health-card" aria-labelledby="gsc-access-health"><h2 id="gsc-access-health">Google Search Console · acesso e submissão</h2>
    {health?<><p>Verificado: {health.checkedAt}. Escrita OK registra uma submissão comprovada; sitemap inalterado não é reenviado para testar acesso.</p>
      <dl style={{overflowWrap:'anywhere'}}>{Object.entries(health).filter(([key])=>!['checkedAt','sitemaps'].includes(key)).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{typeof value==='string'?value:'—'}</dd></div>)}</dl>
      {health.sitemaps?.map(s=><article className="owner-health-card" key={s.url} style={{overflowWrap:'anywhere'}}><h3>{s.url}</h3>
        <p>Estado: <strong>{s.status}</strong> · verificação: {s.lastCheck??'—'}</p>
        <p>Última submissão comprovada: {s.lastSuccessfulSubmission??'—'}</p><p>Última tentativa de envio: {s.lastAttempt??'—'}</p>
        <p>Erro: {s.errorCategory??'Nenhum'} · etapa: {s.failureStage??'—'} · HTTP: {s.httpStatus??'—'}</p>
        <p>Nova tentativa: {s.retryStatus}{s.retryAt?` · a partir de ${s.retryAt}, no próximo ciclo diário`:''}</p>
        {s.retryStatus==='BLOCKED'?<p>Requer correção de acesso/configuração ou do sitemap; nenhum reenvio cego.</p>:null}
      </article>)}
      <p>Submissão não garante rastreamento, indexação ou posição no Google.</p></>:<p>Aguardando verificação pelo próximo ciclo SEO. Nenhuma chamada Google é feita ao abrir esta página.</p>}
  </section>;
}
