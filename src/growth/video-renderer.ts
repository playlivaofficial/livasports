import 'server-only';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import {VIDEO,type GrowthVideoChannel} from './config';
import type {GrowthFixtureSnapshot,GrowthPlatformDraft,GrowthVideoScene} from './types';

export interface RenderedGrowthVideo {channel:GrowthVideoChannel;status:'READY';mimeType:'video/mp4';sha256:string;byteLength:number;data:Buffer;}
export interface FailedGrowthVideo {channel:GrowthVideoChannel;status:'FAILED';mimeType:null;sha256:null;byteLength:null;data:null;errorCode:string;}
export type GrowthVideoRenderResult=RenderedGrowthVideo|FailedGrowthVideo;
export interface VideoRendererOptions {assetLoader?:(url:string)=>Promise<string|null>;ffmpeg?:string;}

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
function wrappedLines(value:string,max=27){
  const words=value.trim().split(/\s+/).filter(Boolean).flatMap(word=>word.length>max?word.match(new RegExp(`.{1,${max}}`,'g'))??[word]:[word]),result:string[]=[];let current='';
  for(const word of words){const next=current?`${current} ${word}`:word;if(next.length<=max){current=next;continue;}if(current)result.push(current);current=word;}
  if(current)result.push(current);return result;
}
const block=(rows:string[],x:number,y:number,size:number,anchor:'start'|'middle'='start',weight=800,fill='#f7fbff')=>rows.map((line,index)=>
  `<text x="${x}" y="${y+index*size*1.13}" text-anchor="${anchor}" fill="${fill}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}">${escape(line)}</text>`).join('');
function fittedBlock(value:string,x:number,y:number,anchor:'start'|'middle',assets=false){
  const choices=assets?[[64,24,3],[56,28,3],[48,33,4],[40,40,5]]:[[72,21,3],[64,24,4],[54,29,4],[44,36,5]];
  for(const [size,max,limit] of choices){const rows=wrappedLines(value,max);if(rows.length<=limit)return block(rows,x,y,size,anchor,900);}
  const rows=wrappedLines(value,46),size=Math.max(24,Math.min(38,Math.floor(230/(rows.length*1.13))));
  return block(rows,x,y,size,anchor,900);
}
function fittedLabel(value:string,x:number,y:number){
  for(const [size,max,limit] of [[42,17,3],[36,20,3],[30,24,4]]){const rows=wrappedLines(value,max);if(rows.length<=limit)return block(rows,x,y,size,'middle',800);}
  return block(wrappedLines(value,28),x,y,27,'middle',800);
}
function fittedSubtitle(value:string,x:number,y:number,anchor:'start'|'middle'){
  for(const [size,max,limit] of [[48,29,3],[43,33,4],[37,39,5],[32,46,6]]){const rows=wrappedLines(value,max);if(rows.length<=limit)return block(rows,x,y,size,anchor,800);}
  const rows=wrappedLines(value,52),size=Math.max(25,Math.min(31,Math.floor(225/(rows.length*1.13))));
  return block(rows,x,y,size,anchor,800);
}

async function remoteAsset(url:string):Promise<string|null>{
  let parsed:URL;try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:'||!['cdn.sportmonks.com','livasports.com','www.livasports.com'].includes(parsed.hostname))return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{const response=await fetch(parsed,{signal:controller.signal,headers:{'user-agent':'LivaSports-Growth-Renderer/1.1'}});if(!response.ok)return null;
    const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>1_500_000)return null;
    const image=await sharp(buffer).resize(300,300,{fit:'contain'}).png().toBuffer();return `data:image/png;base64,${image.toString('base64')}`;
  }catch{return null;}finally{clearTimeout(timer);}
}

async function sceneSvg(scene:GrowthVideoScene,fixture:GrowthFixtureSnapshot,channel:GrowthVideoChannel,load:(url:string)=>Promise<string|null>){
  const assets=await Promise.all(scene.assets.slice(0,2).map(async asset=>({...asset,data:asset.url?await load(asset.url):null})));
  const accent=channel==='TIKTOK'?'#d5ff48':channel==='INSTAGRAM_REELS'?'#ff4fb8':'#ff365f';
  const visualAssets=!['ODDS','CTA','WATCHLIST'].includes(scene.visual),assetY=channel==='TIKTOK'?590:channel==='INSTAGRAM_REELS'?620:600;
  const geometry=channel==='TIKTOK'?`<path d="M-120 420 L1080 120 L1080 330 L-120 630Z" fill="${accent}" opacity=".08"/><path d="M720 0 L1080 0 L1080 880 L930 920Z" fill="${accent}" opacity=".05"/>`
    :channel==='INSTAGRAM_REELS'?`<circle cx="900" cy="360" r="330" fill="none" stroke="${accent}" stroke-width="3" opacity=".12"/><circle cx="900" cy="360" r="240" fill="none" stroke="${accent}" stroke-width="2" opacity=".1"/><rect x="34" y="210" width="1012" height="1010" rx="70" fill="none" stroke="#ffffff" stroke-width="2" opacity=".06"/>`
      :`<rect x="0" width="24" height="1920" fill="${accent}"/><path d="M760 180 H1080 V1030 L930 1120 H760Z" fill="${accent}" opacity=".07"/><path d="M76 190 H1004" stroke="#ffffff" opacity=".08" stroke-width="2"/>`;
  const card=(x:number)=>channel==='TIKTOK'?`<path d="M${x-18} ${assetY+35} L${x+270} ${assetY-10} L${x+318} ${assetY+310} L${x+18} ${assetY+340}Z" fill="#07131ccc" stroke="${accent}" stroke-width="3"/>`
    :channel==='INSTAGRAM_REELS'?`<rect x="${x-25}" y="${assetY-25}" width="350" height="390" rx="54" fill="#ffffff0b" stroke="#ffffff28" stroke-width="3"/>`
      :`<rect x="${x-20}" y="${assetY-20}" width="340" height="380" rx="22" fill="#07131ce6" stroke="${accent}" stroke-width="4"/><rect x="${x-20}" y="${assetY-20}" width="10" height="380" fill="${accent}"/>`;
  const assetMarkup=visualAssets?assets.map((asset,index)=>{const x=index?690:90;
    const picture=asset.data?`<image href="${asset.data}" x="${x}" y="${assetY}" width="300" height="300" preserveAspectRatio="xMidYMid meet"/>`
      :asset.kind==='PLAYER_SILHOUETTE'?`<circle cx="${x+150}" cy="${assetY+100}" r="82" fill="#294451"/><path d="M${x+35} ${assetY+300} Q${x+150} ${assetY+155} ${x+265} ${assetY+300}Z" fill="#294451"/>`
        :`<circle cx="${x+150}" cy="${assetY+150}" r="132" fill="#102634" stroke="#39596a" stroke-width="4"/><text x="${x+150}" y="${assetY+175}" text-anchor="middle" fill="${accent}" font-size="72" font-family="Arial" font-weight="900">${escape(asset.label.slice(0,2).toUpperCase())}</text>`;
    return `${card(x)}${picture}`;
  }).join(''):'';
  const assetLabels=visualAssets?assets.map((asset,index)=>fittedLabel(asset.label,index?840:240,assetY+350)).join(''):'';
  const watchlistItems=scene.visual==='WATCHLIST'?scene.subtitle.split(/\s+•\s+/).slice(0,5):[];
  const special=scene.visual==='WATCHLIST'?`<g>${watchlistItems.map((item,index)=>{const size=Math.max(22,Math.min(34,Math.floor(810/Math.max(1,item.length*.57))));return `<rect x="76" y="${520+index*135}" width="928" height="104" rx="${channel==='INSTAGRAM_REELS'?38:18}" fill="#ffffff0b" stroke="${index===0?accent:'#ffffff20'}" stroke-width="${index===0?3:2}"/><circle cx="126" cy="${572+index*135}" r="27" fill="${index===0?accent:'#183442'}"/><text x="126" y="${582+index*135}" text-anchor="middle" fill="${index===0?'#07131c':'#f7fbff'}" font-family="Arial" font-size="26" font-weight="900">${index+1}</text><text x="174" y="${582+index*135}" fill="#f7fbff" font-family="Arial" font-size="${size}" font-weight="800">${escape(item.replace(/^\d+\.\s*/,''))}</text>`;}).join('')}</g>`:scene.visual==='ODDS'?`<g><text x="76" y="650" fill="#a8bdc8" font-family="Arial" font-size="27" font-weight="800" letter-spacing="5">COMPARAÇÃO 1 X 2</text>
    ${[0,1,2].map((_,index)=>`<rect x="76" y="${725+index*115}" width="${580+index*125}" height="62" rx="31" fill="${index===1?'#ffffff24':accent}" opacity="${index===1?'.55':'.78'}"/><text x="${96+index*5}" y="${767+index*115}" fill="#f7fbff" font-family="Arial" font-size="28" font-weight="900">${['CASA','EMPATE','FORA'][index]}</text>`).join('')}
    <text x="76" y="1130" fill="#f7fbff" font-family="Arial" font-size="42" font-weight="900">MESMO MERCADO. PREÇOS DIFERENTES.</text></g>`:scene.visual==='CTA'?`<g>
    <rect x="76" y="600" width="928" height="420" rx="44" fill="#ffffff0b" stroke="${accent}" stroke-width="3"/>
    ${['DADOS','ODDS','MEU BILHETE'].map((label,index)=>`<rect x="${108+index*303}" y="700" width="258" height="92" rx="46" fill="${index===1?accent:'#102634'}"/><text x="${237+index*303}" y="760" text-anchor="middle" fill="${index===1?'#07131c':'#f7fbff'}" font-family="Arial" font-size="25" font-weight="900">${label}</text>`).join('')}
    <rect x="160" y="860" width="760" height="112" rx="56" fill="${accent}"/><text x="540" y="932" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="34" font-weight="900">ABRIR LIVASPORTS  →</text></g>`:'';
  const subtitle=channel==='TIKTOK'?`<rect x="76" y="${VIDEO.subtitleTop}" rx="22" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#06131cf5"/><rect x="76" y="${VIDEO.subtitleTop}" width="14" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="${accent}"/>`
    :channel==='INSTAGRAM_REELS'?`<rect x="76" y="${VIDEO.subtitleTop}" rx="48" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#07131cdd" stroke="#ffffff32" stroke-width="3"/>`
      :`<rect x="76" y="${VIDEO.subtitleTop}" rx="16" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#07131cf5" stroke="${accent}" stroke-width="3"/><rect x="112" y="${VIDEO.subtitleTop+30}" width="150" height="42" rx="21" fill="${accent}"/><text x="187" y="${VIDEO.subtitleTop+59}" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="20" font-weight="900">RESUMO</text>`;
  const topLabel=channel==='TIKTOK'?'RÁPIDO E DIRETO':channel==='INSTAGRAM_REELS'?'MATCH EDIT':'GUIA EM 5 CENAS';
  const subtitleCopy=scene.visual==='WATCHLIST'?'Top 5 priorizado pelo motor de crescimento para a agenda brasileira.':scene.subtitle;
  const footerSize=Math.max(20,Math.min(28,Math.floor(850/Math.max(1,fixture.competition.name.length*.55))));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO.width}" height="${VIDEO.height}" viewBox="0 0 ${VIDEO.width} ${VIDEO.height}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${channel==='INSTAGRAM_REELS'?'#100b20':'#06131c'}"/><stop offset="1" stop-color="${channel==='TIKTOK'?'#123829':channel==='INSTAGRAM_REELS'?'#29142f':'#201421'}"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1080" height="1920" fill="url(#bg)"/><circle cx="890" cy="340" r="440" fill="url(#glow)"/><circle cx="130" cy="1550" r="380" fill="url(#glow)"/>
  ${geometry}<text x="76" y="112" fill="${accent}" font-family="Arial" font-size="36" font-weight="900">LivaSports</text><text x="1000" y="112" text-anchor="end" fill="#a8bdc8" font-family="Arial" font-size="21" letter-spacing="4">${topLabel}</text>
  <rect x="76" y="154" width="928" height="3" fill="#2a4959"/>${fittedBlock(scene.headline,channel==='INSTAGRAM_REELS'?540:76,280,channel==='INSTAGRAM_REELS'?'middle':'start',visualAssets)}
  ${assetMarkup}${assetLabels}${special}${subtitle}
  ${fittedSubtitle(subtitleCopy,channel==='TIKTOK'?112:540,VIDEO.subtitleTop+(channel==='YOUTUBE_SHORTS'?120:105),channel==='TIKTOK'?'start':'middle')}
  <text x="540" y="1770" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="${footerSize}" font-weight="800">${escape(fixture.competition.name)} · ${scene.order}</text>
  <rect x="76" y="1830" width="${Math.round(928*(scene.order/5))}" height="10" rx="5" fill="${accent}"/><rect x="76" y="1830" width="928" height="10" rx="5" fill="none" stroke="#345463" stroke-width="2"/>
  </svg>`;
}

function runFfmpeg(binary:string,args:string[]){return new Promise<void>((resolve,reject)=>{const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-8000);});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`FFMPEG_${code}:${stderr}`)));});}

export async function renderGrowthVideo(draft:GrowthPlatformDraft,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<RenderedGrowthVideo>{
  const binary=options.ffmpeg??ffmpegPath;if(!binary)throw new Error('FFMPEG_UNAVAILABLE');
  const directory=await mkdtemp(join(tmpdir(),'livasports-growth-')),output=join(directory,`${draft.channel.toLowerCase()}.mp4`),load=options.assetLoader??remoteAsset;
  try{
    for(const scene of draft.scenes){const svg=await sceneSvg(scene,fixture,draft.channel,load);await sharp(Buffer.from(svg)).png({compressionLevel:7}).toFile(join(directory,`scene-${scene.order}.png`));}
    const args:string[]=[];for(const scene of draft.scenes)args.push('-framerate',String(VIDEO.fps),'-loop','1','-t',String(scene.durationSeconds),'-i',join(directory,`scene-${scene.order}.png`));
    const filters=draft.scenes.map((scene,index)=>{const out=Math.max(.1,scene.durationSeconds-.3),motion=scene.transition==='SLIDE'?"x='min(iw-iw/zoom,on*1.5)'":"x='iw/2-(iw/zoom/2)'";
      const fade=scene.transition==='FADE'?`,fade=t=in:st=0:d=0.25,fade=t=out:st=${out}:d=0.3`:scene.transition==='SLIDE'?',fade=t=in:st=0:d=0.1':'';
      return `[${index}:v]scale=${VIDEO.width}:${VIDEO.height},zoompan=z='min(zoom+0.00045,1.035)':${motion}:y='ih/2-(ih/zoom/2)':d=1:s=${VIDEO.width}x${VIDEO.height}:fps=${VIDEO.fps}${fade},setsar=1,setpts=PTS-STARTPTS[v${index}]`;});
    filters.push(`${draft.scenes.map((_,index)=>`[v${index}]`).join('')}concat=n=${draft.scenes.length}:v=1:a=0[outv]`);
    args.push('-filter_complex',filters.join(';'),'-map','[outv]','-an','-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-r',String(VIDEO.fps),'-movflags','+faststart','-y',output);
    await runFfmpeg(binary,args);const data=await readFile(output);if(!data.length||data.length>VIDEO.maxRenderBytes)throw new Error('VIDEO_SIZE_INVALID');
    return {channel:draft.channel,status:'READY',mimeType:'video/mp4',sha256:createHash('sha256').update(data).digest('hex'),byteLength:data.length,data};
  }finally{await rm(directory,{recursive:true,force:true});}
}

export async function renderGrowthVideos(drafts:Record<GrowthVideoChannel,GrowthPlatformDraft>,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<GrowthVideoRenderResult[]>{
  const channels=Object.keys(drafts) as GrowthVideoChannel[];
  const results:GrowthVideoRenderResult[]=[];
  // A single 1080×1920 encoder comfortably fits the serverless memory budget; three parallel FFmpeg
  // processes do not. Keep platform output deterministic while bounding peak memory to one encoder.
  for(const channel of channels){try{results.push(await renderGrowthVideo(drafts[channel],fixture,options));}catch(error){results.push({channel,status:'FAILED',mimeType:null,sha256:null,byteLength:null,data:null,
    errorCode:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'VIDEO_RENDER_FAILED'});}}
  return results;
}
