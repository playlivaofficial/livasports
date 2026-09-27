'use client';
import {useState} from 'react';
import Link from 'next/link';
import {CHANNEL_UTM,VIDEO_CHANNELS} from './config';
import type {GrowthContentItem,GrowthDashboard,RankedGrowthFixture} from './types';
import {PublishingCard,PublishingCounts,PublishingHistory,publishingDate} from './ManualPublishing';
import type {PublishingOverview} from './manual-publishing';
import {MasterSocial} from './MasterSocial';

type Action=(key:string,body:Record<string,unknown>)=>Promise<void>;
export function latestQueueItems(items:GrowthContentItem[]){
  const latest=new Map<string,GrowthContentItem>();
  for(const item of items){const previous=latest.get(item.fixtureId);if(!item.supersededAt&&(!previous||item.revision>previous.revision))latest.set(item.fixtureId,item);}
  return latest;
}
export function GrowthQueue({dashboard:initial}:{dashboard:GrowthDashboard}){
  const [dashboard,setDashboard]=useState(initial),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const latest=latestQueueItems(dashboard.items);
  const act:Action=async(key,body)=>{
    setBusy(key);setMessage('');
    try{const response=await fetch('/api/owner/growth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json() as {error?:string};if(!response.ok){
        const errors:Record<string,string>={ALREADY_POSTED:'Esta versão já foi registrada. Consulte o histórico; não publique novamente por engano.',STALE_OR_UNREADY_ASSET:'O vídeo mudou ou ainda não está pronto. Recarregue a fila antes de continuar.',POSTING_NOT_ALLOWED:'Este conteúdo precisa de revisão antes da publicação.',INVALID_POST_URL:'Use uma URL HTTPS válida, sem usuário ou senha.',RATE_LIMITED:'Muitas ações em sequência. Aguarde um minuto e tente novamente.'};
        throw new Error(errors[result.error??'']??result.error??'Não foi possível concluir a ação.');
      }
      const fresh=await fetch('/api/owner/growth');if(!fresh.ok)throw new Error('Registro salvo; recarregue para atualizar a fila.');
      setDashboard(await fresh.json() as GrowthDashboard);setMessage(body.action==='mark-posted'?'Publicação registrada. Histórico preservado.':'Atualizado.');
    }catch(error){setMessage(error instanceof Error?error.message:'ACTION_FAILED');}finally{setBusy('');}
  };
  return <main className="owner-health owner-growth">
    <header className="owner-health-header"><div><p className="owner-growth-kicker">LivaSports · publicação manual</p><h1>Fila de crescimento</h1>
      <p>Revise → baixe o vídeo → copie os textos → publique na rede social → registre aqui. Nenhuma publicação automática.</p></div>
      <div className="owner-health-actions"><Link href="/owner/health">Saúde</Link><Link href="/owner/analytics">Analytics</Link><Link href="/owner/growth/dashboard">Growth dashboard</Link><Link href="/owner/growth/scorecard">Scorecard semanal</Link>
        <Link href="/owner/growth/authority">Autoridade editorial</Link><button disabled={!!busy} onClick={()=>act('refresh',{action:'refresh'})}>{busy==='refresh'?'Atualizando…':'Atualizar e gerar'}</button></div></header>
    <p className="manual-notice" role="status" aria-live="polite">{busy?'Salvando…':message}</p>
    <PublishingCounts dashboard={dashboard} latest={latest}/>
    <p>{dashboard.considered} considerados · {dashboard.producible} produzíveis · leitura {publishingDate(dashboard.generatedAt)} (Brasília).</p>
    {!dashboard.publishing?<p role="alert">Histórico de publicação indisponível. Registro de novos posts temporariamente desabilitado.</p>:null}
    <section><h2>Top 10 agora</h2><div className="owner-growth-list">{dashboard.content.map((row,index)=><FixtureOpportunity key={row.signals.fixtureId} row={row} rank={index+1}
      social={dashboard.social.some(item=>item.signals.fixtureId===row.signals.fixtureId)} item={latest.get(row.signals.fixtureId)} overview={dashboard.publishing} busy={busy} act={act}/>)}</div>
      {!dashboard.content.length?<p className="owner-health-notice">Nenhuma partida elegível no horizonte atual.</p>:null}</section>
    <PublishingHistory key={dashboard.generatedAt} overview={dashboard.publishing}/>
    <details className="manual-history"><summary>Histórico de produção · estados anteriores e editorial</summary>
      {dashboard.items.map(item=><article key={item.id}><h3>{item.fixture.home.name} vs {item.fixture.away.name} · r{item.revision}</h3>
        <p>{item.creativeVersion??'Legado'} · {publishingDate(item.createdAt)} · {item.supersededAt?'SUPERSEDED':item.trigger}</p>
        <p>{item.channels.map(c=>`${CHANNEL_UTM[c.channel].label}: ${c.status}`).join(' · ')}</p>
        <div className="manual-copy-actions">{item.platformAssets?.filter(a=>a.status==='READY').map(a=><a key={a.channel} href={`/api/owner/growth/items/${item.id}/video/${a.channel}?download=1`}>{CHANNEL_UTM[a.channel].label} · versão histórica</a>)}</div>
      </article>)}<p>Últimos {dashboard.items.length} pacotes. O histórico de publicação acima tem paginação independente.</p></details>
  </main>;
}
function FixtureOpportunity({row,rank,social,item,overview,busy,act}:{row:RankedGrowthFixture;rank:number;social:boolean;item?:GrowthContentItem;overview?:PublishingOverview;busy:string;act:Action}){
  const {signals,priority}=row;
  const review=item?<ContentReview item={item} overview={overview} busy={busy} act={act}/>:<p className="owner-health-notice">Ainda não gerado. Use “Atualizar e gerar” para criar o pacote.</p>;
  return <article className="owner-growth-item"><div className="owner-growth-rank"><span>#{rank}</span><strong>{priority.total}</strong><small>pontos</small>{social?<b>Top 5 social</b>:null}</div>
    <div className="owner-growth-main"><header><div><small>{signals.competitionName}</small><h3>{signals.home.name} vs {signals.away.name}</h3><time>{publishingDate(signals.kickoff)} · Brasília</time></div>
      <a href={row.destinationUrl} target="_blank" rel="noreferrer">Abrir destino</a></header>
      <details><summary>Prioridade, SEO e contexto</summary><ul>{priority.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
        <div className="owner-growth-score">{priority.lines.map(line=><span key={line.component}><b>{line.component}</b><em>{line.points}/{line.weight}</em><small>{line.reason}</small></span>)}</div>
        <p>{row.odds.label} — {row.odds.bookmakers.map(book=>book.name).join(', ')}</p>
        {item?.content.seo?<><p>{item.content.seo.level} · {item.content.seo.context}</p><p>{item.content.seo.intent.queries.join(' · ')}</p><p>{item.content.seo.placements.join(' · ')}</p></>:null}
        {item&&social?<button disabled={!!busy} onClick={()=>act(`regen:${signals.fixtureId}`,{action:'regenerate',fixtureId:signals.fixtureId})}>Atualizar pacote se necessário</button>:null}</details>
      {social?review:<p>SEO / oportunidade · sem geração de vídeo, voz ou imagens. Histórico preservado abaixo.</p>}
    </div></article>;
}
function ContentReview({item,overview,busy,act}:{item:GrowthContentItem;overview?:PublishingOverview;busy:string;act:Action}){
  const content=item.content,editorial=item.channels.find(c=>c.channel==='EDITORIAL');
  return <div className="owner-growth-copy">
    {content.assetModel==='MASTER_V1'?<><MasterSocial item={item}/><details><summary>Publicação por plataforma · estados independentes</summary><div className="owner-growth-platforms">{VIDEO_CHANNELS.map(channel=><PublishingCard compact key={`${item.id}:${channel}`} item={item} channel={channel} overview={overview} busy={busy} act={act}/>)}</div></details></>:<p>Versão anterior preservada no histórico. Master e imagens serão preparados na próxima geração elegível.</p>}
    {editorial?<details><summary>Social editorial · {editorial.status}</summary><p>{content.captions.EDITORIAL}</p><a href={editorial.trackedUrl} target="_blank" rel="noreferrer">Link editorial</a>
      {editorial.status!=='PUBLISHED'?<div className="manual-copy-actions">{['APPROVED','REJECTED',...(editorial.status==='APPROVED'?['PUBLISHED']:[])].map(status=><button key={status} disabled={!!busy||editorial.status===status} onClick={()=>act(`editorial:${item.id}`,{action:'transition',itemId:item.id,channel:'EDITORIAL',status})}>{status}</button>)}</div>:null}</details>:null}
    <details><summary>Jogadores e direitos</summary>{content.players?.length?content.players.map(p=><p key={p.id}>{p.name}: {p.selectionReason} · {p.media.licenseStatus} · {p.media.commercialEligible?'uso comercial aprovado':'fallback sem retrato'}</p>):<p>Fallback seguro com clubes e personagens Liva.</p>}</details>
  </div>;
}
