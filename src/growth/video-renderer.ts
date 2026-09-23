import 'server-only';
import './render-fonts';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import {CHANNEL_VOICE,VIDEO,VOICE,type GrowthVideoChannel} from './config';
import {BRAND,brandDefsSvg,livaSportsLockupSvg} from './brand';
import {pickScenery,sceneryDefs,scenerySvg,SCENERY_FAMILIES,type SceneryFamily} from './scenery';
import {narrateScenes,type NarrationResult,type VoiceClip,type VoiceProvider} from './voice';
import type {GrowthFixtureSnapshot,GrowthPlatformDraft,GrowthVideoScene,GrowthRenderMetadata} from './types';
import {clashPoses,renderCharacter,CHARACTER_POSES,type CharacterIdentity,type CharacterPose} from './characters';
import {loadCharacterArt} from './character-art';
import {matchPalettes,type TeamPalette} from './palette';
import {playLivaPromoSvg} from './promo';
import {loadSceneryArt} from './scenery-art';

export interface RenderedGrowthVideo {channel:GrowthVideoChannel;status:'READY';mimeType:'video/mp4';sha256:string;byteLength:number;data:Buffer;
  /**
   * What the owner queue shows about this render's audio: which voice, and why it is silent if it is.
   * Absent on a video reused from storage, whose narration state was recorded when it was first made.
   */
  voice?:{mode:string;provider:string;lines:number;degradedReason:string|null};renderMetadata?:GrowthRenderMetadata;}
export interface FailedGrowthVideo {channel:GrowthVideoChannel;status:'FAILED';mimeType:null;sha256:null;byteLength:null;data:null;errorCode:string;}
export type GrowthVideoRenderResult=RenderedGrowthVideo|FailedGrowthVideo;
export interface VideoRendererOptions {
  /** Shared invocation deadline; checked before work and enforced on every external process. */
  deadlineMs?:number;
  assetLoader?:(url:string)=>Promise<string|null>;
  ffmpeg?:string;
  /** Injected in tests; production resolves the configured provider itself. */
  voice?:VoiceProvider;
  /** Shared across the three platform renders of one fixture so an identical line is synthesised once. */
  voiceCache?:Map<string,Promise<VoiceClip>>;
  characterLoader?:(identity:CharacterIdentity,pose:CharacterPose,palette:TeamPalette)=>Promise<string|null>;
  sceneryLoader?:typeof loadSceneryArt;
}

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
function fittedSubtitle(value:string,x:number,y:number,anchor:'start'|'middle'){
  for(const [size,max,limit] of [[48,29,3],[43,33,4],[37,39,5],[32,46,6]]){const rows=wrappedLines(value,max);if(rows.length<=limit)return block(rows,x,y,size,anchor,800);}
  const rows=wrappedLines(value,52),size=Math.max(25,Math.min(31,Math.floor(225/(rows.length*1.13))));
  return block(rows,x,y,size,anchor,800);
}

/** Team names on their nameplate: two lines maximum, sized down only as far as the longest club needs. */
function fittedTeamName(value:string,cx:number,y:number,width=396){
  // Prefer a compact complete single line over a large two-line club label.
  for(const size of [34,31,28,26])if(value.length*size*.60<=width)return block([value],cx,y,size,'middle',800);
  for(const size of [30,27,23]){
    const max=Math.floor(width/(size*.72));
    if(value.split(/\s+/).some(word=>word.length>max))continue;
    const rows=wrappedLines(value,max);
    if(rows.length<=2)return block(rows,cx,y-(rows.length-1)*size*.55,size,'middle',900);
  }
  const rows=wrappedLines(value,Math.floor(width/15));
  return block(rows,cx,y-(rows.length-1)*11,Math.min(21,78/(rows.length*1.13)),'middle',900);
}
const brazilKickoffFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const brazilKickoff=(value:string)=>{
  const at=new Date(value);
  return Number.isFinite(at.getTime())?`${brazilKickoffFormatter.format(at).replace(',',' ·')} · horário de Brasília`:'';
};

async function remoteAsset(url:string):Promise<string|null>{
  let parsed:URL;try{parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='https:'||!['cdn.sportmonks.com','livasports.com','www.livasports.com'].includes(parsed.hostname))return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{const response=await fetch(parsed,{signal:controller.signal,headers:{'user-agent':'LivaSports-Growth-Renderer/1.1'}});if(!response.ok)return null;
    const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>1_500_000)return null;
    const image=await sharp(buffer).resize(300,300,{fit:'contain'}).png().toBuffer();return `data:image/png;base64,${image.toString('base64')}`;
  }catch{return null;}finally{clearTimeout(timer);}
}

export async function growthSceneSvg(scene:GrowthVideoScene,fixture:GrowthFixtureSnapshot,draft:GrowthPlatformDraft,options:VideoRendererOptions={}){
  const channel=draft.channel,load=options.assetLoader??remoteAsset;
  const assets=await Promise.all(scene.assets.slice(0,2).map(async asset=>({...asset,data:asset.url?await load(asset.url):null})));
  // V1.2: one brand accent on every platform. The channels previously carried lime, pink and red —
  // none of them a LivaSports colour — which is precisely what made the output read as generic
  // template spam. Platforms differ by composition, pacing and geometry, not by repainting the brand.
  const accent=BRAND.livasports.accent;
  const support=channel==='TIKTOK'?BRAND.livasports.mark:channel==='INSTAGRAM_REELS'?BRAND.livasports.tldInk:BRAND.livasports.accentStrong;
  // V1.2: a real football background per scene, chosen deterministically from the fixture, its creative
  // template and the channel. Character mode is excluded inside pickScenery until the original
  // character artwork exists, so fixtures fall back to stadium, pitch, tunnel and editorial treatments.
  const sceneSeed=`${fixture.fixtureId}:${scene.order}`;
  const storedFamily=draft.creative?.scenery[scene.order-1] as SceneryFamily|undefined;
  const family=storedFamily&&SCENERY_FAMILIES.includes(storedFamily)?storedFamily:pickScenery(fixture.fixtureId,scene.template,channel,scene.order);
  const sceneryArt=await (options.sceneryLoader??loadSceneryArt)(family);
  const scenery= sceneryArt?`<image href="${sceneryArt}" x="${family==='CROWD_ATMOSPHERE'?-180:0}" y="${family==='CROWD_ATMOSPHERE'?-400:0}" width="${family==='CROWD_ATMOSPHERE'?1440:1080}" height="${family==='CROWD_ATMOSPHERE'?2560:1920}" preserveAspectRatio="xMidYMid slice"/><rect width="1080" height="1920" fill="#041218" opacity="${family==='EDITORIAL_SPORTS'?'.70':family==='PITCH_MATCHDAY'?'.25':'.42'}"/><rect width="1080" height="1920" fill="url(#sc-vig)"/>`:scenerySvg(family,'sc',sceneSeed);
  const visualAssets=!["ODDS","CTA","WATCHLIST"].includes(scene.visual);
  const palettes=matchPalettes({slug:fixture.home.slug??'',name:fixture.home.name},{slug:fixture.away.slug??'',name:fixture.away.name});
  const posePair=draft.creative?.poses.length===2&&draft.creative.poses.every(pose=>CHARACTER_POSES.includes(pose as CharacterPose))?draft.creative.poses as [CharacterPose,CharacterPose]:clashPoses(`${fixture.fixtureId}:${channel}`);
  const identities=draft.creative?.identities?.length===2?draft.creative.identities:['curly','fade'] as const;
  const useCharacters=draft.creative?.characters==='LIVA_ORIGINAL'&&scene.visual==='HOOK';
  const characterArt=useCharacters?await Promise.all(identities.map((identity,index)=>(options.characterLoader??loadCharacterArt)(identity,posePair[index],index?palettes.away:palettes.home))):[];
  const characterMode=useCharacters&&characterArt.every(Boolean);
  const geometry=channel==='TIKTOK'?`<path d="M-120 420 L1080 120 L1080 330 L-120 630Z" fill="${accent}" opacity=".08"/><path d="M720 0 L1080 0 L1080 880 L930 920Z" fill="${support}" opacity=".05"/>`
    :channel==='INSTAGRAM_REELS'?`<circle cx="900" cy="360" r="330" fill="none" stroke="${accent}" stroke-width="3" opacity=".12"/><circle cx="900" cy="360" r="240" fill="none" stroke="${support}" stroke-width="2" opacity=".1"/><rect x="34" y="210" width="1012" height="1010" rx="70" fill="none" stroke="#ffffff" stroke-width="2" opacity=".06"/>`
      :`<rect x="0" width="24" height="1920" fill="${accent}"/><path d="M760 180 H1080 V1030 L930 1120 H760Z" fill="${support}" opacity=".07"/><path d="M76 190 H1004" stroke="#ffffff" opacity=".08" stroke-width="2"/>`;
  /**
   * V1.2 matchup composition. The old layout floated two 300px badges high on the canvas and left a
   * ~380px dead band between the team names and the caption box, which is what made every frame look
   * unfinished. Crests are now 396px inside a deliberate plate, names sit on their own nameplate
   * directly beneath, a versus medallion anchors the centre, and a context strip closes the gap.
   */
  const CREST=396,CREST_Y=508,CREST_X=[78,606] as const,NAME_Y=CREST_Y+CREST+92;
  const sideInk=(index:number)=>index?support:accent;
  const plate=(x:number,index:number)=>channel==='TIKTOK'
    ?`<path d="M${x-16} ${CREST_Y+30} L${x+CREST+12} ${CREST_Y-16} L${x+CREST+26} ${CREST_Y+CREST+4} L${x-2} ${CREST_Y+CREST+46}Z" fill="#06131cd9" stroke="${sideInk(index)}" stroke-width="4"/>`
    :channel==='INSTAGRAM_REELS'
      ?`<rect x="${x-18}" y="${CREST_Y-18}" width="${CREST+36}" height="${CREST+36}" rx="70" fill="#ffffff0f" stroke="#ffffff33" stroke-width="3"/>`
      :`<rect x="${x-16}" y="${CREST_Y-16}" width="${CREST+32}" height="${CREST+32}" rx="28" fill="#06131cec" stroke="${sideInk(index)}" stroke-width="4"/><rect x="${x-16}" y="${CREST_Y-16}" width="13" height="${CREST+32}" fill="${sideInk(index)}"/>`;
  const assetMarkup=visualAssets&&!characterMode?assets.map((asset,index)=>{
    const x=CREST_X[index]??CREST_X[0];
    const picture=asset.data
      ?`<image href="${asset.data}" x="${x+44}" y="${CREST_Y+44}" width="${CREST-88}" height="${CREST-88}" preserveAspectRatio="xMidYMid meet"/>`
      :asset.kind==='PLAYER_SILHOUETTE'
        ?`<circle cx="${x+CREST/2}" cy="${CREST_Y+150}" r="104" fill="#27454f"/><path d="M${x+52} ${CREST_Y+CREST-30} Q${x+CREST/2} ${CREST_Y+196} ${x+CREST-52} ${CREST_Y+CREST-30}Z" fill="#27454f"/>`
        :`<circle cx="${x+CREST/2}" cy="${CREST_Y+CREST/2}" r="${CREST/2-54}" fill="#0f2a38" stroke="${sideInk(index)}" stroke-width="5"/><text x="${x+CREST/2}" y="${CREST_Y+CREST/2+38}" text-anchor="middle" fill="${sideInk(index)}" font-size="112" font-family="Arial,Helvetica,sans-serif" font-weight="900">${escape(asset.label.slice(0,2).toUpperCase())}</text>`;
    return `${plate(x,index)}${picture}`;
  }).join(''):'';
  // Versus medallion sits in the 132px channel between the two plates, so the centre is never empty.
  const versus=visualAssets&&!characterMode?`<circle cx="540" cy="${CREST_Y+CREST/2}" r="52" fill="#06131cf0" stroke="${accent}" stroke-width="4"/>`+
    `<text x="540" y="${CREST_Y+CREST/2+19}" text-anchor="middle" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="900">×</text>`:'';
  const assetLabels=visualAssets&&!characterMode?assets.map((asset,index)=>{
    const x=CREST_X[index]??CREST_X[0];
    return `<rect x="${x-8}" y="${NAME_Y-47}" width="${CREST+16}" height="76" rx="${channel==='INSTAGRAM_REELS'?22:10}" fill="#06131cdd" stroke="#ffffff28" stroke-width="1"/><path d="M${x+80} ${NAME_Y+29} H${x+CREST-80}" stroke="${sideInk(index)}" stroke-width="2"/>`+
      fittedTeamName(asset.label,x+CREST/2,NAME_Y);
  }).join(''):'';
  // Context strip: competition and Brazil kickoff, closing the old dead band above the caption box.
  const contextStrip=visualAssets&&!characterMode?`<rect x="76" y="1118" width="928" height="116" rx="${channel==='INSTAGRAM_REELS'?58:20}" fill="#06131cd2" stroke="#ffffff22" stroke-width="2"/>`+
    `<rect x="76" y="1118" width="12" height="116" rx="6" fill="${accent}"/>`+
    `<text x="126" y="1164" fill="${BRAND.livasports.muted}" font-family="Arial,Helvetica,sans-serif" font-size="23" letter-spacing="3">${escape(fixture.competition.name.toUpperCase().slice(0,42))}</text>`+
    `<text x="126" y="1210" fill="${BRAND.livasports.ink}" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800">${escape(brazilKickoff(fixture.kickoff))}</text>`:'';
  const watchlistItems=scene.visual==='WATCHLIST'?scene.subtitle.split(/\s+•\s+/).slice(0,5):[];
  const special=scene.visual==='WATCHLIST'?`<g>${watchlistItems.map((item,index)=>{const size=Math.max(22,Math.min(34,Math.floor(810/Math.max(1,item.length*.57))));return `<rect x="76" y="${520+index*135}" width="928" height="104" rx="${channel==='INSTAGRAM_REELS'?38:18}" fill="#ffffff0b" stroke="${index===0?accent:'#ffffff20'}" stroke-width="${index===0?3:2}"/><circle cx="126" cy="${572+index*135}" r="27" fill="${index===0?accent:'#183442'}"/><text x="126" y="${582+index*135}" text-anchor="middle" fill="${index===0?'#07131c':'#f7fbff'}" font-family="Arial" font-size="26" font-weight="900">${index+1}</text><text x="174" y="${582+index*135}" fill="#f7fbff" font-family="Arial" font-size="${size}" font-weight="800">${escape(item.replace(/^\d+\.\s*/,''))}</text>`;}).join('')}</g>`:scene.visual==='ODDS'?`<g><text x="76" y="650" fill="#a8bdc8" font-family="Arial" font-size="27" font-weight="800" letter-spacing="5">COMPARAÇÃO 1 X 2</text>
    <path d="M76 694 H1004" stroke="${accent}" stroke-width="3"/>
    ${[0,1,2].map((_,index)=>{const cx=220+index*320;return `<text x="${cx}" y="900" text-anchor="middle" fill="${index===1?accent:'#f7fbff'}" font-family="Arial" font-size="168" font-weight="900" font-style="${channel==='TIKTOK'?'italic':'normal'}">${['1','X','2'][index]}</text><text x="${cx}" y="962" text-anchor="middle" fill="#d3e2e5" font-family="Arial" font-size="24" font-weight="800" letter-spacing="4">${['CASA','EMPATE','FORA'][index]}</text>${index<2?`<path d="M${cx+160} 765 V978" stroke="#ffffff30" stroke-width="2"/>`:''}`;}).join('')}
    <path d="M76 1028 H1004" stroke="#ffffff55" stroke-width="2"/>
    <text x="540" y="1125" text-anchor="middle" fill="#f7fbff" font-family="Arial" font-size="34" font-weight="900">MESMO JOGO. MESMO MERCADO.</text>
    <text x="540" y="1184" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="28" letter-spacing="3">COMPARE OS PREÇOS</text></g>`:scene.visual==='CTA'?`<g>
    ${channel==='TIKTOK'?['ABRE O JOGO','COMPARA AS ODDS','MONTA SEU BILHETE'].map((label,index)=>`<g transform="translate(${110+index*42} ${530+index*132}) rotate(-3)"><rect width="${780-index*40}" height="100" rx="12" fill="${index===1?accent:'#06131cef'}" stroke="${accent}" stroke-width="3"/><text x="32" y="66" fill="${index===1?'#07131c':'#f7fbff'}" font-family="Arial" font-size="40" font-weight="900">${index+1}. ${label}</text></g>`).join('')
      :channel==='INSTAGRAM_REELS'?`<circle cx="540" cy="760" r="233" fill="#06131cce" stroke="${accent}" stroke-width="3"/><circle cx="540" cy="760" r="216" fill="none" stroke="#ffffff25"/><text x="540" y="670" text-anchor="middle" fill="#d7eae5" font-family="Arial" font-size="27" letter-spacing="5">O JOGO CONTINUA</text><text x="540" y="760" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="55" font-weight="900">Compare.</text><text x="540" y="832" text-anchor="middle" fill="#f7fbff" font-family="Arial" font-size="55" font-weight="900">Decida.</text><text x="540" y="900" text-anchor="middle" fill="#d7eae5" font-family="Arial" font-size="25">DADOS · ODDS · MEU BILHETE</text>`
      :['DADOS DO CONFRONTO','COMPARAÇÃO DE ODDS','MEU BILHETE'].map((label,index)=>`<rect x="110" y="${510+index*144}" width="860" height="114" rx="18" fill="#06131cf2" stroke="${accent}" stroke-width="2"/><circle cx="178" cy="${567+index*144}" r="32" fill="${accent}"/><text x="178" y="${578+index*144}" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="30" font-weight="900">${index+1}</text><text x="244" y="${578+index*144}" fill="#f7fbff" font-family="Arial" font-size="34" font-weight="900">${label}</text>`).join('')}
    <rect x="160" y="1010" width="760" height="70" rx="35" fill="${accent}"/><text x="540" y="1056" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="30" font-weight="900">ABRIR LIVASPORTS.COM  →</text></g>${playLivaPromoSvg(draft.creative?.promo??'DISCOVER')}`:'';
  const characterMarkup=characterMode?identities.map((identity,index)=>{
    const height=channel==='TIKTOK'?800:channel==='INSTAGRAM_REELS'?760:710;
    const x=channel==='YOUTUBE_SHORTS'?(index?550:70):index?535:10;
    const y=channel==='TIKTOK'?442:channel==='INSTAGRAM_REELS'?465:index?520:465;
    const figure=renderCharacter({identity,pose:posePair[index],palette:index?palettes.away:palettes.home,seed:fixture.fixtureId,x,y,height,id:`liva-${index}`},characterArt[index]);
    const cx=index?780:290,asset=assets[index];
    return `${figure??''}<rect x="${cx-205}" y="1192" width="410" height="86" rx="${channel==='INSTAGRAM_REELS'?22:10}" fill="#06131cf2" stroke="#ffffff30" stroke-width="1"/><path d="M${cx-170} 1278 H${cx+170}" stroke="${index?palettes.away.primary:palettes.home.primary}" stroke-width="3"/>`+
      (asset?.data?`<image href="${asset.data}" x="${cx-184}" y="1205" width="60" height="60"/>`:'')+
      fittedTeamName(index?fixture.away.name:fixture.home.name,cx+(asset?.data?38:0),1246,asset?.data?292:376);
  }).join('')+`<text x="540" y="1158" text-anchor="middle" fill="#cadbd5" font-family="Arial" font-size="17" letter-spacing="2">PERSONAGENS LIVA · ARTE ORIGINAL</text>`:'';
  const subtitle=channel==='TIKTOK'?`<rect x="76" y="${VIDEO.subtitleTop}" rx="22" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#06131cf5"/><rect x="76" y="${VIDEO.subtitleTop}" width="14" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="${accent}"/>`
    :channel==='INSTAGRAM_REELS'?`<rect x="76" y="${VIDEO.subtitleTop}" rx="48" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#07131cdd" stroke="#ffffff32" stroke-width="3"/>`
      :`<rect x="76" y="${VIDEO.subtitleTop}" rx="16" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#07131cf5" stroke="${accent}" stroke-width="3"/><rect x="112" y="${VIDEO.subtitleTop+30}" width="150" height="42" rx="21" fill="${accent}"/><text x="187" y="${VIDEO.subtitleTop+59}" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="20" font-weight="900">RESUMO</text>`;
  const topLabel=channel==='TIKTOK'?'RÁPIDO E DIRETO':channel==='INSTAGRAM_REELS'?'EM CAMPO':'GUIA EM 5 CENAS';
  const subtitleCopy=scene.visual==='WATCHLIST'?'Cinco confrontos para acompanhar. Veja a agenda completa no LivaSports.com.':scene.subtitle;
  const footerSize=Math.max(20,Math.min(28,Math.floor(850/Math.max(1,fixture.competition.name.length*.55))));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO.width}" height="${VIDEO.height}" viewBox="0 0 ${VIDEO.width} ${VIDEO.height}">
  <defs>${sceneryDefs('sc',family)}<radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>${brandDefsSvg()}</defs>
  ${scenery}
  ${geometry}${livaSportsLockupSvg({x:76,y:78,size:34})}<text x="1000" y="112" text-anchor="end" fill="${BRAND.livasports.muted}" font-family="Arial" font-size="21" letter-spacing="4">${topLabel}</text>
  <rect x="76" y="154" width="928" height="3" fill="#2a4959"/>${fittedBlock(scene.headline,channel==='INSTAGRAM_REELS'?540:76,280,channel==='INSTAGRAM_REELS'?'middle':'start',visualAssets)}
  ${assetMarkup}${versus}${assetLabels}${contextStrip}${characterMarkup}${special}${subtitle}
  ${fittedSubtitle(subtitleCopy,channel==='TIKTOK'?112:540,VIDEO.subtitleTop+(channel==='YOUTUBE_SHORTS'?120:105),channel==='TIKTOK'?'start':'middle')}
  <text x="540" y="1770" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="${footerSize}" font-weight="800">${escape(fixture.competition.name)} · ${scene.order}</text>
  <rect x="76" y="1830" width="${Math.round(928*(scene.order/5))}" height="10" rx="5" fill="${accent}"/><rect x="76" y="1830" width="928" height="10" rx="5" fill="none" stroke="#345463" stroke-width="2"/>
  </svg>`;
}

function runFfmpeg(binary:string,args:string[],deadlineMs=Date.now()+90_000){return new Promise<string>((resolve,reject)=>{if(Date.now()>=deadlineMs)return reject(new Error('RENDER_BUDGET_EXCEEDED'));
  const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';
  const timeout=setTimeout(()=>child.kill(),Math.min(90_000,Math.max(1,deadlineMs-Date.now())));
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-8000);});child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',code=>{clearTimeout(timeout);if(code===0)resolve(stderr);else reject(new Error(`FFMPEG_${code}:${stderr}`));});});}

let glyphCheck:Promise<void>|undefined;
/** Missing fonts can return a successful MP4 made of tofu boxes. Reject that before paid narration. */
export function verifyGrowthGlyphs(){
  return glyphCheck??=Promise.all(['WWW','iii'].map(value=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="96"><text x="4" y="70" fill="white" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="800">${value}</text></svg>`)).ensureAlpha().raw().toBuffer())).then(([wide,narrow])=>{
    if(wide.equals(narrow)||!wide.some(Boolean)||!narrow.some(Boolean))throw new Error('FONT_GLYPHS_UNAVAILABLE');
  }).catch(error=>{glyphCheck=undefined;throw error;});
}

interface NarrationAudio {narration:NarrationResult;files:Array<{path:string;delayMs:number;order:number;seconds:number}>;}
/** Synthesise the draft's own scene voiceovers and stage them as files FFmpeg can delay into place. */
async function buildNarrationAudio(draft:GrowthPlatformDraft,directory:string,options:VideoRendererOptions):Promise<NarrationAudio>{
  const mode=CHANNEL_VOICE[draft.channel];
  const lines=draft.scenes.map(scene=>({order:scene.order,startSeconds:scene.startSeconds,text:scene.voiceover}));
  const narration=await narrateScenes(lines,mode,{provider:options.voice,cache:options.voiceCache,deadlineMs:options.deadlineMs});
  const files:NarrationAudio['files']=[];
  for(const line of narration.clips){
    const path=join(directory,`voice-${line.order}.mp3`);
    await writeFile(path,line.clip.data);
    const probe=await runFfmpeg(options.ffmpeg??ffmpegPath!,['-hide_banner','-i',path,'-f','null','-'],options.deadlineMs);
    const duration=/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe);
    if(!duration)throw new Error('VOICE_DURATION_UNKNOWN');
    const seconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
    if(seconds>10)throw new Error('VOICE_LINE_EXCEEDS_SCENE_BUDGET');
    files.push({path,order:line.order,seconds,delayMs:Math.max(0,Math.round(line.startSeconds*1000))});
  }
  return {narration,files};
}

export async function renderGrowthVideo(draft:GrowthPlatformDraft,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<RenderedGrowthVideo>{
  const started=Date.now();
  options={...options,deadlineMs:options.deadlineMs??started+90_000};
  if(started>=options.deadlineMs!)throw new Error('RENDER_BUDGET_EXCEEDED');
  await verifyGrowthGlyphs();
  const binary=options.ffmpeg??ffmpegPath;if(!binary)throw new Error('FFMPEG_UNAVAILABLE');
  const directory=await mkdtemp(join(tmpdir(),'livasports-growth-')),output=join(directory,`${draft.channel.toLowerCase()}.mp4`);
  try{
    const audio=await buildNarrationAudio(draft,directory,options);
    let cursor=0;
    const sceneTiming=draft.scenes.map(scene=>{
      const clip=audio.files.find(file=>file.order===scene.order),audioSeconds=clip?.seconds??0;
      const durationSeconds=Math.ceil(Math.max(scene.durationSeconds,audioSeconds+.4)*VIDEO.fps)/VIDEO.fps;
      const timing={order:scene.order,startSeconds:cursor,durationSeconds,audioSeconds};
      if(clip)clip.delayMs=Math.round((cursor+.1)*1000);cursor+=durationSeconds;return timing;
    });
    if(cursor>45)throw new Error('VOICE_VIDEO_EXCEEDS_DURATION_BUDGET');
    draft={...draft,scenes:draft.scenes.map((scene,index)=>({...scene,...sceneTiming[index]}))};
    let drawnCharacters=false;
    for(const scene of draft.scenes){if(Date.now()>=options.deadlineMs!)throw new Error('RENDER_BUDGET_EXCEEDED');const svg=await growthSceneSvg(scene,fixture,draft,options);drawnCharacters||=svg.includes('data-liva-character=');await sharp(Buffer.from(svg)).png({compressionLevel:7}).toFile(join(directory,`scene-${scene.order}.png`));}
    const args:string[]=[];for(const scene of draft.scenes)args.push('-framerate',String(VIDEO.fps),'-loop','1','-t',String(scene.durationSeconds),'-i',join(directory,`scene-${scene.order}.png`));
    const filters=draft.scenes.map((scene,index)=>{const out=Math.max(.1,scene.durationSeconds-.3),motion=scene.transition==='SLIDE'?"x='min(iw-iw/zoom,on*1.5)'":"x='iw/2-(iw/zoom/2)'";
      const fade=scene.transition==='FADE'?`,fade=t=in:st=0:d=0.25,fade=t=out:st=${out}:d=0.3`:scene.transition==='SLIDE'?',fade=t=in:st=0:d=0.1':'';
      return `[${index}:v]scale=${VIDEO.width}:${VIDEO.height},zoompan=z='min(zoom+0.00045,1.035)':${motion}:y='ih/2-(ih/zoom/2)':d=1:s=${VIDEO.width}x${VIDEO.height}:fps=${VIDEO.fps}${fade},setsar=1,setpts=PTS-STARTPTS[v${index}]`;});
    filters.push(`${draft.scenes.map((_,index)=>`[v${index}]`).join('')}concat=n=${draft.scenes.length}:v=1:a=0[outv]`);
    // Narration is laid against the scene plan the draft already carries, so a line lands with the
    // frame it describes. A degraded narration still renders: the video is designed to read muted.
    const totalSeconds=draft.scenes.reduce((sum,scene)=>sum+scene.durationSeconds,0);
    for(const clip of audio.files)args.push('-i',clip.path);
    if(audio.files.length){
      const first=draft.scenes.length;
      audio.files.forEach((clip,index)=>filters.push(`[${first+index}:a]adelay=${clip.delayMs}|${clip.delayMs},volume=${VOICE.voiceGain}[n${index}]`));
      // Rights-safe ambience: shaped noise generated by FFmpeg itself, never a licensed recording.
      filters.push(`anoisesrc=d=${totalSeconds.toFixed(2)}:c=pink:a=${VOICE.ambienceGain.toFixed(3)}:seed=42,highpass=f=140,lowpass=f=820[amb]`);
      filters.push(`${audio.files.map((_,index)=>`[n${index}]`).join('')}[amb]amix=inputs=${audio.files.length+1}:normalize=0:duration=longest[mixed]`);
      filters.push(`[mixed]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.94,aresample=44100[outa]`);
    }
    args.push('-filter_threads','1','-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map','[outv]');
    if(audio.files.length)args.push('-map','[outa]','-c:a','aac','-b:a','128k','-ac','2');else args.push('-an');
    const maxVideoKbps=Math.floor(VIDEO.maxRenderBytes*8*.88/totalSeconds/1000-128);
    args.push('-t',totalSeconds.toFixed(2),'-c:v','libx264','-preset','ultrafast','-threads','1','-crf','28','-maxrate',`${maxVideoKbps}k`,'-bufsize',`${maxVideoKbps*2}k`,'-pix_fmt','yuv420p','-r',String(VIDEO.fps),'-movflags','+faststart','-y',output);
    await runFfmpeg(binary,args,options.deadlineMs);const data=await readFile(output);if(!data.length||data.length>VIDEO.maxRenderBytes)throw new Error('VIDEO_SIZE_INVALID');
    const voice={mode:audio.narration.mode,provider:audio.narration.provider,lines:audio.files.length,degradedReason:audio.narration.degradedReason};
    return {channel:draft.channel,status:'READY',mimeType:'video/mp4',sha256:createHash('sha256').update(data).digest('hex'),byteLength:data.length,data,voice,
      renderMetadata:{voice,characterMode:drawnCharacters?'LIVA_ORIGINAL':draft.creative?.characters==='LIVA_ORIGINAL'?'CREST_FALLBACK':'NONE',
        scenery:draft.creative?.scenery??draft.scenes.map(scene=>pickScenery(fixture.fixtureId,scene.template,draft.channel,scene.order)),durationSeconds:totalSeconds,renderMs:Date.now()-started,sceneTiming}};
  }finally{await rm(directory,{recursive:true,force:true});}
}

export async function renderGrowthVideos(drafts:Record<GrowthVideoChannel,GrowthPlatformDraft>,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<GrowthVideoRenderResult[]>{
  const channels=Object.keys(drafts) as GrowthVideoChannel[];
  const results:GrowthVideoRenderResult[]=[];
  const sourceLoader=options.assetLoader??remoteAsset,assetCache=new Map<string,Promise<string|null>>();
  const cachedLoader=(url:string)=>{const cached=assetCache.get(url);if(cached)return cached;const pending=sourceLoader(url);assetCache.set(url,pending);return pending;};
  // One synthesis cache for the whole fixture: the three platforms often word a line identically, and
  // each repeat would otherwise be a redundant provider call paid for and waited on three times.
  const characterCache=new Map<string,Promise<string|null>>();
  const sceneryCache=new Map<string,Promise<string|null>>();
  const sceneryLoader:typeof loadSceneryArt=family=>{
    const key=family==='TUNNEL_BIGMATCH'?'tunnel':'stadium';const cached=sceneryCache.get(key);if(cached)return cached;
    const pending=(options.sceneryLoader??loadSceneryArt)(family);sceneryCache.set(key,pending);return pending;
  };
  const characterLoader=(identity:CharacterIdentity,pose:CharacterPose,palette:TeamPalette)=>{
    const key=JSON.stringify([identity,pose,palette]);const cached=characterCache.get(key);if(cached)return cached;
    const pending=(options.characterLoader??loadCharacterArt)(identity,pose,palette);characterCache.set(key,pending);return pending;
  };
  const batchOptions={...options,deadlineMs:options.deadlineMs??Date.now()+120_000,assetLoader:cachedLoader,characterLoader,sceneryLoader,voiceCache:options.voiceCache??new Map<string,Promise<VoiceClip>>()};
  // A single 1080×1920 encoder comfortably fits the serverless memory budget; three parallel FFmpeg
  // processes do not. Keep platform output deterministic, reuse media across platform variants and
  // bound peak memory to one encoder.
  for(const channel of channels){try{results.push(await renderGrowthVideo(drafts[channel],fixture,batchOptions));}catch(error){results.push({channel,status:'FAILED',mimeType:null,sha256:null,byteLength:null,data:null,
    errorCode:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'VIDEO_RENDER_FAILED'});}}
  return results;
}
