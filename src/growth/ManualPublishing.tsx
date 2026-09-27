'use client';
import {useState,type FormEvent} from 'react';
import {CHANNEL_UTM,VIDEO_CHANNELS,type GrowthVideoChannel} from './config';
import type {GrowthContentItem,GrowthDashboard} from './types';
import {currentVideoUrl,matchingPost,postSnapshot,publishingState,type PublishingOverview} from './manual-publishing';

export const publishingDate=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
export function CopyButton({label,value}:{label:string;value:string}){
  const [copied,setCopied]=useState(false),[fallback,setFallback]=useState(false);
  async function copy(){try{await navigator.clipboard.writeText(value);setCopied(true);setFallback(false);}catch{setFallback(true);setCopied(false);}}
  return <><button type="button" onClick={copy}>{copied?'✓ Copiado':label}</button><span className="sr-only" role="status">{copied?`${label}: copiado`:''}</span>
    {fallback?<label className="manual-copy-fallback">Não foi possível copiar automaticamente. Selecione e copie:
      <textarea readOnly value={value} onFocus={e=>e.currentTarget.select()} aria-label={`Texto para ${label}`}/></label>:null}</>;
}
export function PublishingCard({item,channel,overview,busy,act}:{item:GrowthContentItem;channel:GrowthVideoChannel;overview?:PublishingOverview;busy:string;act:(key:string,body:Record<string,unknown>)=>Promise<void>}){
  const [confirm,setConfirm]=useState(false),[external,setExternal]=useState(''),[notes,setNotes]=useState('');
  const draft=item.content.platforms![channel],asset=item.platformAssets?.find(a=>a.channel===channel),record=item.channels.find(c=>c.channel===channel)!;
  const post=matchingPost(item,channel,overview?.currentPosts??overview?.posts??[]),state=publishingState(item,channel,post);
  const copy=asset?.sha256?post?.snapshot??postSnapshot(item,channel):null;
  const video=currentVideoUrl(item,channel),download=currentVideoUrl(item,channel,true);
  async function submit(event:FormEvent){event.preventDefault();await act(`posted:${item.id}:${channel}`,{action:'mark-posted',itemId:item.id,channel,sha256:asset!.sha256,creativeVersion:item.creativeVersion,externalPostUrl:external,notes});setConfirm(false);}
  return <article className="owner-growth-platform manual-platform" aria-label={`${CHANNEL_UTM[channel].label} · ${item.content.headline}`}>
    <header><div><span>{CHANNEL_UTM[channel].label}</span><strong>{draft.template}</strong></div><b data-status={state}>{state.replaceAll('_',' ')}</b></header>
    {video?<video controls playsInline preload="metadata" src={video} aria-label={`Vídeo ${CHANNEL_UTM[channel].label} de ${item.content.headline}`}/>:<p className="owner-health-notice">Vídeo atual indisponível para publicação. Consulte o histórico para versões anteriores.</p>}
    <p className="manual-meta">{asset?.renderMetadata?.durationSeconds.toFixed(1)??'—'} s · {asset?.generatedAt?publishingDate(asset.generatedAt):'Pendente'} (Brasília)<br/>Revisão {item.revision} · {item.creativeVersion??'Legado'}<br/>{item.content.story?.angle} · Aprovação: {record.status==='PUBLISHED'?'aprovado e publicado':record.status}</p>
    <h4>{draft.title}</h4><p><b>Hook:</b> {draft.hook}</p>
    {copy?<><p className="manual-caption">{copy.caption}</p><p>{copy.hashtags}</p>
      <div className="manual-primary">{download?<a href={download}>Baixar vídeo MP4</a>:null}{video?<a href={video} target="_blank" rel="noreferrer">Abrir prévia</a>:null}</div>
      <div className="manual-copy-actions" aria-label="Copiar texto da plataforma">
        {channel==='YOUTUBE_SHORTS'?<CopyButton label="Copiar título" value={copy.title}/>:null}
        <CopyButton label="Copiar legenda" value={copy.caption}/><CopyButton label="Copiar hashtags" value={copy.hashtags}/>
        <CopyButton label="Copiar URL" value={copy.trackedUrl}/><CopyButton label="Copiar post completo" value={copy.fullText}/>
      </div><details><summary>URL rastreada e CTA</summary><p>{copy.trackedUrl}</p><p>{copy.cta}</p></details>
      {channel==='INSTAGRAM_REELS'?<p>Instagram: use o link na bio ou no contexto permitido pela plataforma; URLs na legenda não são clicáveis.</p>:null}</>:null}
    {state==='POSTED'?<p role="status">Publicado {post?publishingDate(post.postedAt):record.publishedAt?publishingDate(record.publishedAt):'(registro legado)'}. Esta versão já foi marcada. Veja o histórico.</p>:null}
    {state==='READY_TO_POST'&&overview?<button className="manual-post-button" disabled={!!busy} onClick={()=>setConfirm(!confirm)}>Marcar como publicado · {CHANNEL_UTM[channel].label}</button>:null}
    {confirm?<form onSubmit={submit} className="manual-confirm"><strong>Confirmar publicação manual em {CHANNEL_UTM[channel].label}</strong>
      <p>Este botão não publica na rede social. Registra o MP4 da revisão {item.revision} e os textos exibidos acima. Confira se usou exatamente esta versão.</p>
      <label>URL do post (opcional)<input type="url" inputMode="url" maxLength={1000} placeholder="https://…" value={external} onChange={e=>setExternal(e.target.value)}/></label>
      <label>Nota privada (opcional)<textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      <label className="manual-check"><input type="checkbox" required/> Revisei o vídeo e confirmo o registro desta publicação.</label>
      <button disabled={!!busy} type="submit">Confirmar registro</button><button type="button" onClick={()=>setConfirm(false)}>Cancelar</button>
    </form>:null}
    <details><summary>Revisão e detalhes do conteúdo</summary><p>{draft.script}</p><p>Família: {draft.creative?.family??draft.template} · {draft.creative?.hookFamily} · {draft.creative?.ctaFamily}</p>
      <p>Voz: {asset?.renderMetadata?.voice.provider??'—'} · {asset?.renderMetadata?.voice.lines??0} cenas. {asset?.renderMetadata?.voice.degradedReason}</p>
      <ol>{draft.scenes.map(scene=><li key={scene.order}>{scene.startSeconds.toFixed(1)}–{(scene.startSeconds+scene.durationSeconds).toFixed(1)} s: {scene.headline}<br/>{scene.subtitle}</li>)}</ol>
      {state!=='POSTED'?<div className="manual-copy-actions"><button disabled={!!busy||record.status==='APPROVED'} onClick={()=>act(`approve:${item.id}:${channel}`,{action:'transition',itemId:item.id,channel,status:'APPROVED'})}>Aprovar</button>
        <button disabled={!!busy||record.status==='REJECTED'} onClick={()=>act(`reject:${item.id}:${channel}`,{action:'transition',itemId:item.id,channel,status:'REJECTED'})}>Rejeitar</button>
        {['DRAFT','REJECTED'].includes(record.status)?<button disabled={!!busy} onClick={()=>act(`regen:${item.id}:${channel}`,{action:'regenerate-platform',itemId:item.id,channel})}>Regenerar plataforma</button>:null}</div>:null}
    </details>
  </article>;
}
export function PublishingCounts({dashboard,latest}:{dashboard:GrowthDashboard;latest:Map<string,GrowthContentItem>}){
  const overview=dashboard.publishing;
  const states=dashboard.social.flatMap(row=>{const item=latest.get(row.signals.fixtureId);return VIDEO_CHANNELS.map(channel=>item?publishingState(item,channel,matchingPost(item,channel,overview?.currentPosts??overview?.posts??[])):'DRAFT');});
  return <section className="owner-health-cards" aria-label="Publicação manual"><article className="owner-health-card"><span>Top 5 · publicados</span><strong>{states.filter(s=>s==='POSTED').length}/{states.length}</strong></article>
    <article className="owner-health-card"><span>Top 5 · prontos para postar</span><strong>{states.filter(s=>s==='READY_TO_POST').length}</strong></article>
    <article className="owner-health-card"><span>Publicados hoje / 7 dias · Brasília</span><strong>{overview?`${overview.today} / ${overview.last7Days}`:'Indisponível'}</strong></article>
    <article className="owner-health-card"><span>Total por plataforma</span><small>{VIDEO_CHANNELS.map(c=>`${CHANNEL_UTM[c].label}: ${overview?.byPlatform[c]??'—'}`).join(' · ')}</small></article></section>;
}
export function PublishingHistory({overview}:{overview?:PublishingOverview}){
  const [result,setResult]=useState<PublishingOverview|null>(null),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
  const [channel,setChannel]=useState(''),[fixture,setFixture]=useState(''),[version,setVersion]=useState(''),[date,setDate]=useState(''),[state,setState]=useState('POSTED'),[offset,setOffset]=useState(0);
  const current=result??overview;
  async function filter(nextOffset=0){setLoading(true);setMessage('');try{const query=new URLSearchParams({channel,fixture,version,date,offset:String(nextOffset)});
    const response=await fetch(`/api/owner/growth/publishing?${query}`);if(!response.ok)throw Error();setResult(await response.json() as PublishingOverview);setOffset(nextOffset);
  }catch{setMessage('Não foi possível carregar o histórico. Tente novamente.');}finally{setLoading(false);}}
  const posts=(current?.posts??[]).filter(p=>state!=='SUPERSEDED'||p.superseded);
  return <section className="manual-history"><h2>Histórico de publicação manual</h2><p>Registro imutável do que foi confirmado pelo owner. Métricas: tráfego HUMAN no analytics existente; não representam depósitos ou receita.</p>
    <form className="manual-filters" onSubmit={e=>{e.preventDefault();void filter();}}>
      <label>Plataforma<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Todas</option>{VIDEO_CHANNELS.map(c=><option key={c} value={c}>{CHANNEL_UTM[c].label}</option>)}</select></label>
      <label>Estado<select value={state} onChange={e=>setState(e.target.value)}><option value="POSTED">POSTED · todas</option><option value="SUPERSEDED">POSTED · substituídas</option></select></label>
      <label>Partida<input value={fixture} maxLength={100} onChange={e=>setFixture(e.target.value)}/></label><label>Versão criativa<input value={version} maxLength={150} onChange={e=>setVersion(e.target.value)}/></label>
      <label>Data · Brasília<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button disabled={loading}>Filtrar histórico</button>
    </form>{message?<p role="alert">{message}</p>:null}
    {posts.map(post=><article key={post.id} className="manual-history-post"><header><h3>{post.fixtureLabel} · {CHANNEL_UTM[post.channel].label}</h3><b>POSTED{post.superseded?' · SUPERSEDED':''}</b></header>
      <p>{publishingDate(post.postedAt)} · revisão {post.revision} · {post.creativeVersion}</p>
      <p>Sessões {post.metrics.sessions} → jogos {post.metrics.matchViews} → odds {post.metrics.odds} → bilhete {post.metrics.slipAdds} → cliques de saída {post.metrics.clicks}</p>
      <details><summary>Vídeo, texto e atribuição registrados</summary><a href={`/api/owner/growth/items/${post.itemId}/video/${post.channel}?download=1`}>Baixar versão histórica</a>
        <p><b>Título:</b> {post.snapshot.title}</p><p>{post.snapshot.fullText}</p><p>{post.snapshot.storyAngle} · {post.snapshot.creativeFamily}</p>
        <p>Gerado: {publishingDate(post.generatedAt)} · SHA-256: {post.assetSha256}</p><p>Asset: {post.itemId}/{post.channel} · Owner: {post.postedBy.slice(0,12)}</p>
        {post.externalPostUrl?<a href={post.externalPostUrl} target="_blank" rel="noreferrer">Abrir post externo</a>:null}{post.notes?<p>Nota privada: {post.notes}</p>:null}</details>
    </article>)}{!posts.length?<p>Nenhuma publicação registrada neste filtro.</p>:null}
    <div className="manual-copy-actions"><button disabled={loading||offset===0} onClick={()=>filter(Math.max(0,offset-50))}>Anterior</button><span>{current?.total??0} registros</span><button disabled={loading||offset+50>=(current?.total??0)} onClick={()=>filter(offset+50)}>Próxima</button></div>
    <a href="/owner/growth/dashboard">Abrir desempenho no Growth dashboard</a>
  </section>;
}
