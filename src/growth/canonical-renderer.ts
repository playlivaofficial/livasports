import 'server-only';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {sceneLayerSvgs,renderGrowthVideo,type VideoRendererOptions} from './video-renderer';
import {BRAND,brandDefsSvg,livaSportsLockupSvg} from './brand';
import type {GrowthAssetKind,GrowthFixtureSnapshot,GrowthPlatformDraft,GrowthRenderMetadata} from './types';

export interface CanonicalRender {kind:GrowthAssetKind;mimeType:'video/mp4'|'image/png';width:1080;height:1920|1350;data:Buffer;sha256:string;byteLength:number;renderMetadata?:GrowthRenderMetadata;}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const inner=(svg:string)=>svg.replace(/^<svg[^>]*><defs>[\s\S]*?<\/defs>/,'').replace(/<\/svg>$/,'');
const text=(s:string,y:number,size:number,color='#f7fbff')=>`<text x="540" y="${y}" text-anchor="middle" fill="${color}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="800">${escape(s)}</text>`;
function fit(value:string,y:number,width=920,size=48){
  const max=Math.floor(width/(size*.64)),words=value.split(/\s+/),lines:string[]=[];let line='';
  for(const word of words){if((line+' '+word).trim().length>max&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
  return lines.map((s,i)=>text(s,y+i*size*1.15,Math.min(size,width/(s.length*.64)))).join('');
}
/** Dedicated standalone layout, not a video screenshot or a stretched 9:16 bitmap.
 * Same original artwork/palettes/poses as the master; no voice or FFmpeg dependency is invoked. */
export async function renderCanonicalStatics(draft:GrowthPlatformDraft,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<CanonicalRender[]>{
  const hook=draft.scenes[0],layers=await sceneLayerSvgs({...hook,visual:'HOOK'},fixture,draft,options);
  const defs=/<defs>([\s\S]*?)<\/defs>/.exec(layers.background)?.[1]??brandDefsSvg();
  const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(fixture.kickoff));
  const results:CanonicalRender[]=[];
  for(const kind of ['STORY_IMAGE','FEED_IMAGE'] as const){
    const story=kind==='STORY_IMAGE',height=story?1920:1350;
    const top=story?280:205,heroScale=story?1:.84,heroY=story?0:-95;
    const hero=[layers.left,layers.right,...layers.center].map(inner).join('');
    const detailsY=story?1395:1060;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><defs>${defs}</defs>`+
      `<g>${inner(layers.background)}</g>${livaSportsLockupSvg({x:76,y:story?100:60,size:38})}`+
      `<path d="M76 ${story?178:135} H1004" stroke="${BRAND.livasports.accent}" stroke-width="3"/>`+
      fit(hook.headline,top,920,story?58:48)+
      `<g transform="translate(${540*(1-heroScale)} ${heroY}) scale(${heroScale})">${hero}</g>`+
      `<rect x="56" y="${detailsY-64}" width="968" height="${story?345:236}" rx="28" fill="#06131ced" stroke="#ffffff24"/>`+
      fit(fixture.competition.name,detailsY,900,36)+text(`${time} · Brasília`,detailsY+58,34,'#d3e2e5')+
      text('COMPARE AS ODDS NO LIVASPORTS.COM',detailsY+124,story?36:32,BRAND.livasports.accent)+
      (story?text('Dados do jogo → comparação → Meu bilhete',detailsY+191,29):'')+
      text('18+ · Informação, não recomendação de aposta',height-(story?180:35),23,'#b5c9cc')+'</svg>';
    const data=await sharp(Buffer.from(svg)).png({compressionLevel:9}).toBuffer();
    if(data.length>4_000_000)throw Error('STATIC_SIZE_INVALID');
    results.push({kind,mimeType:'image/png',width:1080,height:height as 1920|1350,data,sha256:createHash('sha256').update(data).digest('hex'),byteLength:data.length});
  }
  return results;
}
export async function renderCanonicalPackage(draft:GrowthPlatformDraft,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<CanonicalRender[]>{
  // Statics never call this video path; callers can repair missing images separately.
  const images=await renderCanonicalStatics(draft,fixture,options);
  const video=await renderGrowthVideo(draft,fixture,{...options,master:true,requireNarration:true});
  return [{kind:'MASTER_VIDEO',mimeType:'video/mp4',width:1080,height:1920,data:video.data,sha256:video.sha256,byteLength:video.byteLength,renderMetadata:video.renderMetadata},...images];
}
