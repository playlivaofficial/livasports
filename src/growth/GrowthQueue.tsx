'use client';
/* eslint-disable @next/next/no-img-element */
import {useState} from 'react';
import Link from 'next/link';
import {CHANNEL_UTM,type GrowthChannel} from './config';
import type {GrowthChannelStatus,GrowthContentItem,GrowthDashboard,RankedGrowthFixture} from './types';

const pct=(strength:number)=>`${Math.round(strength*100)}%`;

export function GrowthQueue({dashboard}:{dashboard:GrowthDashboard}){
  const [busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const latest=new Map<string,GrowthContentItem>();
  for(const item of dashboard.items)if(!latest.has(item.fixtureId))latest.set(item.fixtureId,item);
  const act=async(key:string,body:Record<string,unknown>)=>{
    setBusy(key);setMessage('');
    try{const response=await fetch('/api/owner/growth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??'ACTION_FAILED');
      window.location.reload();
    }catch(error){setMessage(error instanceof Error?error.message:'ACTION_FAILED');setBusy('');}
  };
  return <main className="owner-health owner-growth">
    <header className="owner-health-header"><div><p className="owner-growth-kicker">Traffic Engine V1</p><h1>Fila de crescimento</h1>
      <p>Top 5 social e Top 10 de oportunidades, com geração determinística em PT-BR.</p></div>
      <div className="owner-health-actions"><Link href="/owner/health">Saúde</Link><Link href="/owner/analytics">Analytics</Link>
        <button disabled={!!busy} onClick={()=>act('refresh',{action:'refresh'})}>{busy==='refresh'?'Atualizando…':'Atualizar e gerar'}</button></div></header>
    {message?<p className="owner-health-notice" role="alert">{message}</p>:null}
    <section className="owner-health-cards"><article className="owner-health-card"><span>Considerados</span><strong>{dashboard.considered}</strong></article>
      <article className="owner-health-card"><span>Produzíveis</span><strong>{dashboard.producible}</strong></article>
      <article className="owner-health-card"><span>Fila social</span><strong>{dashboard.social.length}</strong></article>
      <article className="owner-health-card"><span>Última leitura</span><strong>{new Intl.DateTimeFormat('pt-BR',{timeStyle:'short',dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(dashboard.generatedAt))}</strong></article></section>
    <section><h2>Top 10 agora</h2><div className="owner-growth-list">{dashboard.content.map((row,index)=><FixtureOpportunity key={row.signals.fixtureId} row={row} rank={index+1}
      social={dashboard.social.some(item=>item.signals.fixtureId===row.signals.fixtureId)} item={latest.get(row.signals.fixtureId)} busy={busy} act={act}/>)}</div>
      {!dashboard.content.length?<p className="owner-health-notice">Nenhuma partida elegível no horizonte atual.</p>:null}</section>
    <section><h2>Histórico de produção</h2><div className="owner-health-scroll"><table className="owner-health-table"><thead><tr><th>Partida</th><th>Revisão</th><th>Origem</th><th>Criado</th><th>Canais</th></tr></thead>
      <tbody>{dashboard.items.map(item=><tr key={item.id}><td>{item.fixture.home.name} × {item.fixture.away.name}</td><td>v{item.revision}</td><td>{item.trigger}</td>
        <td>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(item.createdAt))}</td><td>{item.channels.map(c=>`${CHANNEL_UTM[c.channel].label}: ${c.status}`).join(' · ')}</td></tr>)}</tbody></table></div></section>
  </main>;
}

function FixtureOpportunity({row,rank,social,item,busy,act}:{row:RankedGrowthFixture;rank:number;social:boolean;item?:GrowthContentItem;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const {signals,priority}=row;
  return <article className="owner-growth-item">
    <div className="owner-growth-rank"><span>#{rank}</span><strong>{priority.total}</strong><small>pontos</small>{social?<b>Top 5 social</b>:null}</div>
    <div className="owner-growth-main"><header><div><small>{signals.competitionName}</small><h3>{signals.home.name} × {signals.away.name}</h3><time>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(signals.kickoff))}</time></div>
      <div className="owner-health-actions"><a href={row.destinationUrl} target="_blank" rel="noreferrer">Abrir destino</a>
        {item?<button disabled={!!busy} onClick={()=>act(`regen:${signals.fixtureId}`,{action:'regenerate',fixtureId:signals.fixtureId})}>{busy===`regen:${signals.fixtureId}`?'Gerando…':'Regenerar'}</button>:null}</div></header>
      <ul className="owner-growth-reasons">{priority.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
      <details><summary>Detalhamento da pontuação</summary><div className="owner-growth-score">{priority.lines.map(line=><span key={line.component}><b>{line.component}</b><em>{line.points}/{line.weight}</em><small>{pct(line.strength)} · {line.reason}</small></span>)}</div></details>
      <p className="owner-growth-odds"><b>{row.odds.label}</b>{row.odds.bookmakers.length?` — ${row.odds.bookmakers.map(book=>book.name).join(', ')}`:''}</p>
      {item?<ContentReview item={item} busy={busy} act={act}/>:<p className="owner-health-notice">Ainda não gerado. Use “Atualizar e gerar” para criar o pacote.</p>}
    </div>
  </article>;
}

function ContentReview({item,busy,act}:{item:GrowthContentItem;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  return <div className="owner-growth-review"><div className="owner-growth-preview"><img src={`/api/owner/growth/items/${item.id}/asset`} width="270" height="480" alt={`Prévia vertical de ${item.content.headline}`}/>
    <a href={`/api/owner/growth/items/${item.id}/asset`} target="_blank" rel="noreferrer">Abrir PNG 1080×1920</a></div>
    <div className="owner-growth-copy"><h4>{item.content.hook}</h4><p>{item.content.script}</p>
      <details><summary>Plano de telas</summary><ol>{item.content.screens.map(screen=><li key={screen.order}><b>{screen.durationSeconds}s · {screen.headline}</b><br/>{screen.body}</li>)}</ol></details>
      <div className="owner-growth-channels">{item.channels.map(channel=><ChannelReview key={channel.channel} item={item} channel={channel.channel} status={channel.status} busy={busy} act={act}/>)}</div>
    </div></div>;
}

function ChannelReview({item,channel,status,busy,act}:{item:GrowthContentItem;channel:GrowthChannel;status:GrowthChannelStatus;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const record=item.channels.find(row=>row.channel===channel)!;const key=`${item.id}:${channel}`;
  const update=(next:GrowthChannelStatus)=>act(`${key}:${next}`,{action:'transition',itemId:item.id,channel,status:next});
  return <details className="owner-growth-channel"><summary>{CHANNEL_UTM[channel].label} <span data-status={status}>{status}</span></summary>
    <p>{item.content.captions[channel]}</p><a href={record.trackedUrl} target="_blank" rel="noreferrer">Testar link rastreado</a>
    <div className="owner-health-actions">{status!=='PUBLISHED'?<><button disabled={!!busy||status==='APPROVED'} onClick={()=>update('APPROVED')}>Aprovar</button>
      <button disabled={!!busy||status==='REJECTED'} onClick={()=>update('REJECTED')}>Rejeitar</button></>:null}
      {status==='APPROVED'?<button disabled={!!busy} onClick={()=>update('PUBLISHED')}>Marcar publicado</button>:null}</div>
  </details>;
}
