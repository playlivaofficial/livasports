'use client';
/* eslint-disable @next/next/no-img-element */
import {useState} from 'react';
import {VIDEO_CHANNELS,CHANNEL_UTM,type GrowthVideoChannel} from './config';
import type {GrowthContentItem} from './types';
import {CopyButton,publishingDate} from './ManualPublishing';
import {postSnapshot,socialExportReady} from './manual-publishing';
import {canonicalAssetUrl} from './master-model';
export function MasterSocial({item}:{item:GrowthContentItem}){
  const [channel,setChannel]=useState<GrowthVideoChannel>('INSTAGRAM_REELS');
  const master=item.canonicalAssets?.find(a=>a.kind==='MASTER_VIDEO');
  const ready=VIDEO_CHANNELS.every(c=>socialExportReady(item,c));
  const copy=master&&ready?postSnapshot(item,channel):null;
  if(master&&!ready)return <p role="status">blocked_for_review · Master sem verificação editorial completa.</p>;
  if(!master)return <p>Master pendente. A próxima geração elegível prepara um vídeo e duas imagens, sem três versões por plataforma.</p>;
  return <section className="master-social" aria-label={`Pacote master · ${item.content.headline}`}>
    <p>Uma campanha · revisão {item.revision} · {item.creativeVersion}</p>
    <label>Origem do link ao copiar<select value={channel} onChange={e=>setChannel(e.target.value as GrowthVideoChannel)}>{VIDEO_CHANNELS.map(c=><option key={c} value={c}>{CHANNEL_UTM[c].label}</option>)}</select></label>
    <div className="master-media">{(['MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE'] as const).map(kind=>{
      const asset=item.canonicalAssets?.find(a=>a.kind===kind),url=canonicalAssetUrl(item,kind),download=canonicalAssetUrl(item,kind,true);
      const label=kind==='MASTER_VIDEO'?'Vídeo master':kind==='STORY_IMAGE'?'Story 9:16':'Feed 4:5';
      return <article key={kind}><h4>{label}</h4>{url?kind==='MASTER_VIDEO'?<video src={url} controls playsInline preload="none" aria-label={`${label} · ${item.content.headline}`}/>:<img src={url} width={1080} height={kind==='STORY_IMAGE'?1920:1350} alt={`${label} · ${item.content.headline}`} loading="lazy"/>:<p>Mídia indisponível. Geração e reparação automáticas desativadas.</p>}
        <p>{asset?.width}×{asset?.height}{kind==='MASTER_VIDEO'?` · ${asset?.renderMetadata?.durationSeconds.toFixed(1)} s`:''} · {asset?publishingDate(asset.generatedAt):'Pendente'}</p>
        {url&&download?<div className="manual-copy-actions"><a href={url} target="_blank" rel="noreferrer">Prévia · {label}</a><a href={download}>Baixar · {label}</a></div>:null}
        {copy?<><div className="manual-copy-actions"><CopyButton label={`Copiar legenda · ${label}`} value={copy.caption}/><CopyButton label={`Copiar hashtags · ${label}`} value={copy.hashtags}/><CopyButton label={`Copiar URL · ${label}`} value={copy.trackedUrl}/><CopyButton label={`Copiar post completo · ${label}`} value={copy.fullText}/></div><details><summary>Legenda, CTA e URL · {label}</summary><p>{copy.caption}</p><p>{copy.cta}</p><p>{copy.trackedUrl}</p></details></>:null}
      </article>;
    })}</div>
    <p>O mesmo MP4 serve às três redes. A origem do link e o registro de publicação continuam separados. No Instagram, use o link na bio ou um sticker permitido; URLs em legendas não são clicáveis.</p>
  </section>;
}
