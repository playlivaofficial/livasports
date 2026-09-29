import type {GscHealth} from '@/seo/gsc-health';

/** Safe scalar evidence only. No credentials, raw API responses or live Google requests. */
export function GscHealthPanel({health}:{health:GscHealth|null}){
  return <section className="owner-health-card" aria-labelledby="gsc-access-health"><h2 id="gsc-access-health">Google Search Console · acesso e submissão</h2>
    {health?<><p>Verificado: {health.checkedAt}. Escrita OK registra uma submissão comprovada; sitemap inalterado não é reenviado para testar acesso.</p>
      <dl style={{overflowWrap:'anywhere'}}>{Object.entries(health).filter(([key])=>key!=='checkedAt').map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value??'—'}</dd></div>)}</dl>
      <p>Submissão não garante rastreamento, indexação ou posição no Google.</p></>:<p>Aguardando verificação pelo próximo ciclo SEO. Nenhuma chamada Google é feita ao abrir esta página.</p>}
  </section>;
}
