'use client';
/* eslint-disable @next/next/no-img-element */
import {useState} from 'react';
import Link from 'next/link';
import {CHANNEL_UTM,VIDEO_CHANNELS,type GrowthChannel,type GrowthVideoChannel} from './config';
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
    <header className="owner-health-header"><div><p className="owner-growth-kicker">Traffic Engine V1.1</p><h1>Fila de crescimento</h1>
      <p>Uma prioridade compartilhada para SEO e social, com rascunhos nativos e vídeos verticais em PT-BR.</p></div>
      <div className="owner-health-actions"><Link href="/owner/health">Saúde</Link><Link href="/owner/analytics">Analytics</Link><Link href="/owner/growth/dashboard">Growth dashboard</Link><Link href="/owner/growth/scorecard">Scorecard semanal</Link>
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
      <tbody>{dashboard.items.map(item=><tr key={item.id}><td>{item.fixture.home.name} vs {item.fixture.away.name}</td><td>v{item.revision}</td><td>{item.trigger}</td>
        <td>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(item.createdAt))}</td><td>{item.channels.map(c=>`${CHANNEL_UTM[c.channel].label}: ${c.status}`).join(' · ')}</td></tr>)}</tbody></table></div></section>
  </main>;
}

function FixtureOpportunity({row,rank,social,item,busy,act}:{row:RankedGrowthFixture;rank:number;social:boolean;item?:GrowthContentItem;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const {signals,priority}=row;
  return <article className="owner-growth-item">
    <div className="owner-growth-rank"><span>#{rank}</span><strong>{priority.total}</strong><small>pontos</small>{social?<b>Top 5 social</b>:null}</div>
    <div className="owner-growth-main"><header><div><small>{signals.competitionName}</small><h3>{signals.home.name} vs {signals.away.name}</h3><time>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(signals.kickoff))}</time></div>
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
  const content=item.content;
  return <div className="owner-growth-review"><div className="owner-growth-preview"><img src={`/api/owner/growth/items/${item.id}/asset`} width="270" height="480" alt={`Prévia vertical de ${content.headline}`}/>
    <a href={`/api/owner/growth/items/${item.id}/asset`} target="_blank" rel="noreferrer">Abrir fallback PNG 1080×1920</a></div>
    <div className="owner-growth-copy"><div className="owner-growth-v11-summary"><article><span>SEO</span><strong>{content.seo?.level??'Legado'}{content.seo?` · #${content.seo.rank}`:''}</strong><small>{content.seo?.intent.primary??item.canonicalUrl}</small></article>
      <article><span>História</span><strong>{content.story?.angle??'V1'}</strong><small>{content.story?.reason??'Pacote legado'}</small></article>
      <article><span>Prontidão</span><strong>{content.readiness?`${content.readiness.score}/100 · ${content.readiness.state}`:'V1'}</strong><small>{content.story?.template??'STATIC'}</small></article></div>
      {content.seo?<details><summary>SEO e descoberta interna</summary><p><b>Canônica:</b> <a href={content.seo.intent.canonicalUrl} target="_blank" rel="noreferrer">{content.seo.intent.canonicalUrl}</a></p><p>{content.seo.context}</p><p><b>Intenções:</b> {content.seo.intent.queries.join(' · ')}</p><p><b>Superfícies:</b> {content.seo.placements.join(' · ')}</p></details>:null}
      {content.players?.length?<details><summary>Jogadores e direitos</summary><ul>{content.players.map(player=><li key={player.id}><b>{player.name}</b> — {player.selectionReason}. Mídia: {player.media.licenseStatus} / {player.media.commercialEligible?'uso comercial aprovado':'fallback sem retrato'}.</li>)}</ul></details>:<p className="owner-health-notice">Sem evidência suficiente de jogador: composição segura com clubes.</p>}
      {content.platforms?<div className="owner-growth-platforms">{VIDEO_CHANNELS.map(channel=><VideoChannelReview key={channel} item={item} channel={channel} busy={busy} act={act}/>)}</div>:<><h4>{content.hook}</h4><p>{content.script}</p></>}
      <div className="owner-growth-channels">{item.channels.filter(channel=>channel.channel==='EDITORIAL'||!content.platforms).map(channel=><ChannelReview key={channel.channel} item={item} channel={channel.channel} status={channel.status} busy={busy} act={act}/>)}</div>
    </div></div>;
}

function VideoChannelReview({item,channel,busy,act}:{item:GrowthContentItem;channel:GrowthVideoChannel;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const draft=item.content.platforms![channel],asset=item.platformAssets?.find(row=>row.channel===channel),record=item.channels.find(row=>row.channel===channel)!;
  const videoUrl=`/api/owner/growth/items/${item.id}/video/${channel}`;
  const regenerate=()=>act(`platform:${item.id}:${channel}`,{action:'regenerate-platform',itemId:item.id,channel});
  return <article className="owner-growth-platform"><header><div><span>{CHANNEL_UTM[channel].label}</span><strong>{draft.template}</strong></div><b data-status={record.status}>{record.status}</b></header>
    {asset?.status==='READY'?<video controls muted playsInline preload="metadata" src={videoUrl} aria-label={`Vídeo ${CHANNEL_UTM[channel].label} de ${item.content.headline}`}/>:<div className="owner-growth-video-missing">{asset?.status==='FAILED'?`Render falhou: ${asset.errorCode}`:'Vídeo pendente'}</div>}
      {draft.creative?<details><summary>Direção criativa e narração</summary>
        <p><b>Família:</b> {draft.creative.family??draft.template} · {draft.creative.historyConsidered??0} escolhas recentes consideradas</p>
      <p><b>Cenários:</b> {draft.creative.scenery.join(' · ')}</p>
        <p><b>Personagens:</b> {asset?.renderMetadata?.characterMode??draft.creative.characters} · {draft.creative.poses.join(' / ')}</p>
        <p><b>Identidades (casa / fora):</b> {draft.creative.identities?.join(' / ')??'—'}</p>
        {draft.creative.palettes?<p><b>Paletas (casa / fora):</b> {[draft.creative.palettes.home,draft.creative.palettes.away].map(palette=>`${palette.primary} + ${palette.secondary}${palette.known?'':' (neutra Liva)'}`).join(' / ')}</p>:null}
      <p><b>Promo:</b> PlayLiva.com · {draft.creative.promo}</p>
      <p><b>Voz:</b> {asset?.renderMetadata?`${asset.renderMetadata.voice.provider} · ${asset.renderMetadata.voice.mode} · ${asset.renderMetadata.voice.lines} cenas`: 'Metadados de áudio indisponíveis'}</p>
      {asset?.renderMetadata?.voice.degradedReason?<p role="status">Narração requer revisão: {asset.renderMetadata.voice.degradedReason}</p>:null}
      {asset?.renderMetadata?.voice.cache?<p><b>Cache de voz:</b> {asset.renderMetadata.voice.cache.storeHits+asset.renderMetadata.voice.cache.memoryHits} reutilizadas · {asset.renderMetadata.voice.cache.synthesized} novas ({asset.renderMetadata.voice.cache.characters} caracteres)</p>:null}
      {asset?.renderMetadata?.motion?<p><b>Movimento:</b> {asset.renderMetadata.motion.grammar} · {asset.renderMetadata.motion.fps} fps · {asset.renderMetadata.motion.transitions.join(' → ')}</p>:null}
      {asset?.renderMetadata?.audio?<p><b>Som:</b> {asset.renderMetadata.audio.direction.music} · {asset.renderMetadata.audio.direction.ambience} · kit {asset.renderMetadata.audio.direction.sfxKit} · {asset.renderMetadata.audio.mix.outputLufs??'—'} LUFS · pico {asset.renderMetadata.audio.mix.outputTruePeakDb??'—'} dBTP · trilhas originais LivaSports</p>:null}
        <p><b>Variedade:</b> {draft.creative.hookFamily} · {draft.creative.ctaFamily}</p>
        {asset?.renderMetadata?<p><b>Render:</b> {(asset.renderMetadata.renderMs/1000).toFixed(1)}s · vídeo {asset.renderMetadata.durationSeconds.toFixed(1)}s · {asset.byteLength?`${(asset.byteLength/1_000_000).toFixed(1)} MB`:'—'}</p>:null}
    </details>:null}
    <h4>{draft.title}</h4><p><b>Hook:</b> {draft.hook}</p><p><b>Roteiro:</b> {draft.script}</p><p><b>Legenda:</b> {draft.caption}</p><p><b>Hashtags:</b> {draft.hashtags.join(' ')}</p><p><b>CTA:</b> {draft.cta}</p>
    <details><summary>Plano de cenas e legendas</summary><ol>{draft.scenes.map(scene=><li key={scene.order}><b>{scene.startSeconds}s · {scene.durationSeconds}s · {scene.visual} · {scene.transition}</b><br/>{scene.headline}<br/><small>{scene.subtitle}</small></li>)}</ol></details>
    <div className="owner-growth-platform-links"><a href={record.trackedUrl} target="_blank" rel="noreferrer">Link rastreado</a>{asset?.status==='READY'?<><a href={videoUrl} target="_blank" rel="noreferrer">Prévia MP4</a><a href={`${videoUrl}?download=1`}>Baixar MP4</a></>:null}</div>
    <div className="owner-health-actions">{['DRAFT','REJECTED'].includes(record.status)?<button disabled={!!busy} onClick={regenerate}>{busy===`platform:${item.id}:${channel}`?'Gerando…':'Regenerar plataforma'}</button>:null}
      <ReviewButtons item={item} channel={channel} status={record.status} busy={busy} act={act}/></div>
  </article>;
}

function ReviewButtons({item,channel,status,busy,act}:{item:GrowthContentItem;channel:GrowthChannel;status:GrowthChannelStatus;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const key=`${item.id}:${channel}`,update=(next:GrowthChannelStatus)=>act(`${key}:${next}`,{action:'transition',itemId:item.id,channel,status:next});
  return <>{status!=='PUBLISHED'?<><button disabled={!!busy||status==='APPROVED'} onClick={()=>update('APPROVED')}>Aprovar</button><button disabled={!!busy||status==='REJECTED'} onClick={()=>update('REJECTED')}>Rejeitar</button></>:null}
    {status==='APPROVED'?<button disabled={!!busy} onClick={()=>update('PUBLISHED')}>Marcar publicado</button>:null}</>;
}

function ChannelReview({item,channel,status,busy,act}:{item:GrowthContentItem;channel:GrowthChannel;status:GrowthChannelStatus;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const record=item.channels.find(row=>row.channel===channel)!;
  return <details className="owner-growth-channel"><summary>{CHANNEL_UTM[channel].label} <span data-status={status}>{status}</span></summary>
    <p>{item.content.captions[channel]}</p><a href={record.trackedUrl} target="_blank" rel="noreferrer">Testar link rastreado</a>
    <div className="owner-health-actions"><ReviewButtons item={item} channel={channel} status={status} busy={busy} act={act}/></div>
  </details>;
}
