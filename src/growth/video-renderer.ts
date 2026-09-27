import 'server-only';
import './render-fonts';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import {CHANNEL_VOICE,MOTION_VERSION,VIDEO,VOICE_PACING,type GrowthVideoChannel} from './config';
import {BRAND,brandDefsSvg,livaSportsLockupSvg} from './brand';
import {pickScenery,sceneryDefs,scenerySvg,SCENERY_FAMILIES,type SceneryFamily} from './scenery';
import {narrateScenes,type NarrationResult,type VoiceClip,type VoiceClipStore,type VoiceProvider} from './voice';
import type {GrowthFixtureSnapshot,GrowthPlatformDraft,GrowthVideoScene,GrowthRenderMetadata,GrowthRenderVoice} from './types';
import {clashPoses,renderCharacter,CHARACTER_POSES,type CharacterIdentity,type CharacterPose} from './characters';
import {loadCharacterArt} from './character-art';
import {matchPalettes,type TeamPalette} from './palette';
import {playLivaPromoSvg} from './promo';
import {loadSceneryArt} from './scenery-art';
import {alignTransitions,planMotion,planMasterMotion,sceneTimeline} from './motion';
import {buildMotionGraph,type PlacedLayer,type PreparedScene,type SharedLayers} from './motion-graph';
import {AUDIO_FILES,AUDIO_LIBRARY_VERSION,MIX,placeEffects,selectAudioDirection} from './audio-design';
import {buildMixGraph,loudnormFilter,parseLoudnorm} from './audio-mix';


export interface RenderedGrowthVideo {channel:GrowthVideoChannel;status:'READY';mimeType:'video/mp4';sha256:string;byteLength:number;data:Buffer;
  /**
   * What the owner queue shows about this render's audio: which voice, and why it is silent if it is.
   * Absent on a video reused from storage, whose narration state was recorded when it was first made.
   */
  voice?:GrowthRenderVoice;renderMetadata?:GrowthRenderMetadata;}
export interface FailedGrowthVideo {channel:GrowthVideoChannel;status:'FAILED';mimeType:null;sha256:null;byteLength:null;data:null;errorCode:string;}
export type GrowthVideoRenderResult=RenderedGrowthVideo|FailedGrowthVideo;
export interface VideoRendererOptions {
  master?:boolean;
  requireNarration?:boolean;
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
  /** Persistent narration cache (database-backed in production) so unchanged lines are never re-bought. */
  voiceStore?:VoiceClipStore;
  /** Benchmark override; production always renders at VIDEO.fps. */
  fps?:number;
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


interface SceneLayerSvgs {
  family:SceneryFamily;characterMode:boolean;
  /** Rasterised at BLEED × the canvas; the camera crops the frame out of it. */
  background:string;
  headline:string;left:string;right:string;center:string[];foreground:string;
}
const BLEED=1.1;
const svgDocument=(content:string,defs='',size:{width:number;height:number}={width:VIDEO.width,height:VIDEO.height})=>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${VIDEO.width} ${VIDEO.height}"><defs>${brandDefsSvg()}${defs}</defs>${content}</svg>`;

/**
 * One scene's artwork, split into depth layers. The markup is the approved Premium Creative
 * composition, unchanged in geometry — only its z-order is made explicit so each depth can move on
 * its own. `growthSceneSvg` flattens these same layers, so a still frame and a video frame at rest
 * are pixel-for-pixel the same design.
 */
export async function sceneLayerSvgs(scene:GrowthVideoScene,fixture:GrowthFixtureSnapshot,draft:GrowthPlatformDraft,options:VideoRendererOptions={}):Promise<SceneLayerSvgs>{
  const channel=draft.channel,load=options.assetLoader??remoteAsset;
  const assets=await Promise.all(scene.assets.slice(0,2).map(async asset=>({...asset,data:asset.url?await load(asset.url):null})));
  // V1.2: one brand accent on every platform. Platforms differ by composition, pacing and geometry.
  const accent=BRAND.livasports.accent;
  const support=channel==='TIKTOK'?BRAND.livasports.mark:channel==='INSTAGRAM_REELS'?BRAND.livasports.tldInk:BRAND.livasports.accentStrong;
  const sceneSeed=`${fixture.fixtureId}:${scene.order}`;
  const family=sceneFamily(scene,fixture,draft);
  const sceneryArt=await (options.sceneryLoader??loadSceneryArt)(family);
  const scenery= sceneryArt?`<image href="${sceneryArt}" x="${family==='CROWD_ATMOSPHERE'?-180:0}" y="${family==='CROWD_ATMOSPHERE'?-400:0}" width="${family==='CROWD_ATMOSPHERE'?1440:1080}" height="${family==='CROWD_ATMOSPHERE'?2560:1920}" preserveAspectRatio="xMidYMid slice"/><rect width="1080" height="1920" fill="#041218" opacity="${family==='EDITORIAL_SPORTS'?'.70':family==='PITCH_MATCHDAY'?'.25':'.42'}"/><rect width="1080" height="1920" fill="url(#sc-vig)"/>`:scenerySvg(family,'sc',sceneSeed);
  const visualAssets=!["ODDS","CTA","WATCHLIST"].includes(scene.visual);
  const palettes=matchPalettes({slug:fixture.home.slug??'',name:fixture.home.name},{slug:fixture.away.slug??'',name:fixture.away.name});
  const posePair=draft.creative?.poses.length===2&&draft.creative.poses.every(pose=>CHARACTER_POSES.includes(pose as CharacterPose))?draft.creative.poses as [CharacterPose,CharacterPose]:clashPoses(`${fixture.fixtureId}:${channel}`);
  const identities=draft.creative?.identities?.length===2?draft.creative.identities:['curly','fade'] as const;
  const useCharacters=draft.creative?.characters==='LIVA_ORIGINAL'&&scene.visual==='HOOK';
  const characterArt=useCharacters?await Promise.all(identities.map((identity,index)=>(options.characterLoader??loadCharacterArt)(identity,posePair[index],index?palettes.away:palettes.home))):[];
  const characterMode=useCharacters&&characterArt.every(Boolean);
  // The Shorts edge bar is platform identity, not scenery: it lives in the chrome so the camera never crops it.
  const geometry=channel==='TIKTOK'?`<path d="M-120 420 L1080 120 L1080 330 L-120 630Z" fill="${accent}" opacity=".08"/><path d="M720 0 L1080 0 L1080 880 L930 920Z" fill="${support}" opacity=".05"/>`
    :channel==='INSTAGRAM_REELS'?`<circle cx="900" cy="360" r="330" fill="none" stroke="${accent}" stroke-width="3" opacity=".12"/><circle cx="900" cy="360" r="240" fill="none" stroke="${support}" stroke-width="2" opacity=".1"/><rect x="34" y="210" width="1012" height="1010" rx="70" fill="none" stroke="#ffffff" stroke-width="2" opacity=".06"/>`
      :`<path d="M760 180 H1080 V1030 L930 1120 H760Z" fill="${support}" opacity=".07"/><path d="M76 190 H1004" stroke="#ffffff" opacity=".08" stroke-width="2"/>`;
  /**
   * Matchup composition: 396px crests inside a deliberate plate, names on their own nameplate
   * directly beneath, a versus medallion anchoring the centre, and a context strip below.
   */
  const CREST=396,CREST_Y=508,CREST_X=[78,606] as const,NAME_Y=CREST_Y+CREST+92;
  const sideInk=(index:number)=>index?support:accent;
  const plate=(x:number,index:number)=>channel==='TIKTOK'
    ?`<path d="M${x-16} ${CREST_Y+30} L${x+CREST+12} ${CREST_Y-16} L${x+CREST+26} ${CREST_Y+CREST+4} L${x-2} ${CREST_Y+CREST+46}Z" fill="#06131cd9" stroke="${sideInk(index)}" stroke-width="4"/>`
    :channel==='INSTAGRAM_REELS'
      ?`<rect x="${x-18}" y="${CREST_Y-18}" width="${CREST+36}" height="${CREST+36}" rx="70" fill="#ffffff0f" stroke="#ffffff33" stroke-width="3"/>`
      :`<rect x="${x-16}" y="${CREST_Y-16}" width="${CREST+32}" height="${CREST+32}" rx="28" fill="#06131cec" stroke="${sideInk(index)}" stroke-width="4"/><rect x="${x-16}" y="${CREST_Y-16}" width="13" height="${CREST+32}" fill="${sideInk(index)}"/>`;
  const crestSide=(index:number)=>{
    const asset=assets[index];if(!visualAssets||characterMode||!asset)return '';
    const x=CREST_X[index]??CREST_X[0];
    const picture=asset.data
      ?`<image href="${asset.data}" x="${x+44}" y="${CREST_Y+44}" width="${CREST-88}" height="${CREST-88}" preserveAspectRatio="xMidYMid meet"/>`
      :asset.kind==='PLAYER_SILHOUETTE'
        ?`<circle cx="${x+CREST/2}" cy="${CREST_Y+150}" r="104" fill="#27454f"/><path d="M${x+52} ${CREST_Y+CREST-30} Q${x+CREST/2} ${CREST_Y+196} ${x+CREST-52} ${CREST_Y+CREST-30}Z" fill="#27454f"/>`
        :`<circle cx="${x+CREST/2}" cy="${CREST_Y+CREST/2}" r="${CREST/2-54}" fill="#0f2a38" stroke="${sideInk(index)}" stroke-width="5"/><text x="${x+CREST/2}" y="${CREST_Y+CREST/2+38}" text-anchor="middle" fill="${sideInk(index)}" font-size="112" font-family="Arial,Helvetica,sans-serif" font-weight="900">${escape(asset.label.slice(0,2).toUpperCase())}</text>`;
    const label=`<rect x="${x-8}" y="${NAME_Y-47}" width="${CREST+16}" height="76" rx="${channel==='INSTAGRAM_REELS'?22:10}" fill="#06131cdd" stroke="#ffffff28" stroke-width="1"/><path d="M${x+80} ${NAME_Y+29} H${x+CREST-80}" stroke="${sideInk(index)}" stroke-width="2"/>`+
      fittedTeamName(asset.label,x+CREST/2,NAME_Y);
    return `${plate(x,index)}${picture}${label}`;
  };
  // VS medallion, centred between the crests in the ~96px channel the plates leave (r=44 keeps ≥5px
  // clear of every platform's plate edge). Never an "x": the separator must read as VS on a phone.
  const versus=visualAssets&&!characterMode?versusMedallion(540,CREST_Y+CREST/2,accent):'';
  const contextStrip=visualAssets&&!characterMode?`<rect x="76" y="1118" width="928" height="116" rx="${channel==='INSTAGRAM_REELS'?58:20}" fill="#06131cd2" stroke="#ffffff22" stroke-width="2"/>`+
    `<rect x="76" y="1118" width="12" height="116" rx="6" fill="${accent}"/>`+
    `<text x="126" y="1164" fill="${BRAND.livasports.muted}" font-family="Arial,Helvetica,sans-serif" font-size="23" letter-spacing="3">${escape(fixture.competition.name.toUpperCase().slice(0,42))}</text>`+
    `<text x="126" y="1210" fill="${BRAND.livasports.ink}" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800">${escape(brazilKickoff(fixture.kickoff))}</text>`:'';
  const watchlistItems=scene.visual==='WATCHLIST'?scene.subtitle.split(/\s+•\s+/).slice(0,5):[];
  // Centre pieces enter one after another: list rows, odds columns, CTA steps.
  const center:string[]=[];
  if(versus)center.push(versus);
  if(scene.visual==='WATCHLIST')watchlistItems.forEach((item,index)=>{const size=Math.max(22,Math.min(34,Math.floor(810/Math.max(1,item.length*.57))));
    center.push(`<rect x="76" y="${520+index*135}" width="928" height="104" rx="${channel==='INSTAGRAM_REELS'?38:18}" fill="#ffffff0b" stroke="${index===0?accent:'#ffffff20'}" stroke-width="${index===0?3:2}"/><circle cx="126" cy="${572+index*135}" r="27" fill="${index===0?accent:'#183442'}"/><text x="126" y="${582+index*135}" text-anchor="middle" fill="${index===0?'#07131c':'#f7fbff'}" font-family="Arial" font-size="26" font-weight="900">${index+1}</text><text x="174" y="${582+index*135}" fill="#f7fbff" font-family="Arial" font-size="${size}" font-weight="800">${escape(item.replace(/^\d+\.\s*/,''))}</text>`);});
  if(scene.visual==='ODDS'){
    center.push(`<text x="76" y="650" fill="#a8bdc8" font-family="Arial" font-size="27" font-weight="800" letter-spacing="5">COMPARAÇÃO 1 X 2</text><path d="M76 694 H1004" stroke="${accent}" stroke-width="3"/>`);
    [0,1,2].forEach(index=>{const cx=220+index*320;center.push(`<text x="${cx}" y="900" text-anchor="middle" fill="${index===1?accent:'#f7fbff'}" font-family="Arial" font-size="168" font-weight="900" font-style="${channel==='TIKTOK'?'italic':'normal'}">${['1','X','2'][index]}</text><text x="${cx}" y="962" text-anchor="middle" fill="#d3e2e5" font-family="Arial" font-size="24" font-weight="800" letter-spacing="4">${['CASA','EMPATE','FORA'][index]}</text>${index<2?`<path d="M${cx+160} 765 V978" stroke="#ffffff30" stroke-width="2"/>`:''}`);});
    center.push(`<path d="M76 1028 H1004" stroke="#ffffff55" stroke-width="2"/><text x="540" y="1125" text-anchor="middle" fill="#f7fbff" font-family="Arial" font-size="34" font-weight="900">MESMO JOGO. MESMO MERCADO.</text><text x="540" y="1184" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="28" letter-spacing="3">COMPARE OS PREÇOS</text>`);
  }
  if(scene.visual==='CTA'){
    if(channel==='TIKTOK')['ABRE O JOGO','COMPARA AS ODDS','MONTA SEU BILHETE'].forEach((label,index)=>center.push(`<g transform="translate(${110+index*42} ${530+index*132}) rotate(-3)"><rect width="${780-index*40}" height="100" rx="12" fill="${index===1?accent:'#06131cef'}" stroke="${accent}" stroke-width="3"/><text x="32" y="66" fill="${index===1?'#07131c':'#f7fbff'}" font-family="Arial" font-size="40" font-weight="900">${index+1}. ${label}</text></g>`));
    else if(channel==='INSTAGRAM_REELS')center.push(`<circle cx="540" cy="760" r="233" fill="#06131cce" stroke="${accent}" stroke-width="3"/><circle cx="540" cy="760" r="216" fill="none" stroke="#ffffff25"/><text x="540" y="670" text-anchor="middle" fill="#d7eae5" font-family="Arial" font-size="27" letter-spacing="5">O JOGO CONTINUA</text><text x="540" y="760" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="55" font-weight="900">Compare.</text><text x="540" y="832" text-anchor="middle" fill="#f7fbff" font-family="Arial" font-size="55" font-weight="900">Decida.</text><text x="540" y="900" text-anchor="middle" fill="#d7eae5" font-family="Arial" font-size="25">DADOS · ODDS · MEU BILHETE</text>`);
    else ['DADOS DO CONFRONTO','COMPARAÇÃO DE ODDS','MEU BILHETE'].forEach((label,index)=>center.push(`<rect x="110" y="${510+index*144}" width="860" height="114" rx="18" fill="#06131cf2" stroke="${accent}" stroke-width="2"/><circle cx="178" cy="${567+index*144}" r="32" fill="${accent}"/><text x="178" y="${578+index*144}" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="30" font-weight="900">${index+1}</text><text x="244" y="${578+index*144}" fill="#f7fbff" font-family="Arial" font-size="34" font-weight="900">${label}</text>`));
    center.push(`<rect x="160" y="1010" width="760" height="70" rx="35" fill="${accent}"/><text x="540" y="1056" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="30" font-weight="900">ABRIR LIVASPORTS.COM  →</text>`);
  }
  // Character hook: a compact VS pill between the two nameplates (plates end at x=495 and start at 575).
  if(characterMode)center.push(versusPill(535,1235,accent));
  const characterSide=(index:number)=>{
    if(!characterMode)return '';
    const identity=identities[index]!;
    const height=channel==='TIKTOK'?800:channel==='INSTAGRAM_REELS'?760:710;
    const x=channel==='YOUTUBE_SHORTS'?(index?550:70):index?535:10;
    const y=channel==='TIKTOK'?442:channel==='INSTAGRAM_REELS'?465:index?520:465;
    const figure=renderCharacter({identity,pose:posePair[index],palette:index?palettes.away:palettes.home,seed:fixture.fixtureId,x,y,height,id:`liva-${index}`},characterArt[index]??null);
    const cx=index?780:290,asset=assets[index];
    return `${figure??''}<rect x="${cx-205}" y="1192" width="410" height="86" rx="${channel==='INSTAGRAM_REELS'?22:10}" fill="#06131cf2" stroke="#ffffff30" stroke-width="1"/><path d="M${cx-170} 1278 H${cx+170}" stroke="${index?palettes.away.primary:palettes.home.primary}" stroke-width="3"/>`+
      (asset?.data?`<image href="${asset.data}" x="${cx-184}" y="1205" width="60" height="60"/>`:'')+
      fittedTeamName(index?fixture.away.name:fixture.home.name,cx+(asset?.data?38:0),1246,asset?.data?292:376);
  };
  const subtitle=channel==='TIKTOK'?`<rect x="76" y="${VIDEO.subtitleTop}" rx="22" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#06131cf5"/><rect x="76" y="${VIDEO.subtitleTop}" width="14" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="${accent}"/>`
    :channel==='INSTAGRAM_REELS'?`<rect x="76" y="${VIDEO.subtitleTop}" rx="48" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#07131cdd" stroke="#ffffff32" stroke-width="3"/>`
      :`<rect x="76" y="${VIDEO.subtitleTop}" rx="16" width="928" height="${VIDEO.subtitleBottom-VIDEO.subtitleTop}" fill="#07131cf5" stroke="${accent}" stroke-width="3"/><rect x="112" y="${VIDEO.subtitleTop+30}" width="150" height="42" rx="21" fill="${accent}"/><text x="187" y="${VIDEO.subtitleTop+59}" text-anchor="middle" fill="#07131c" font-family="Arial" font-size="20" font-weight="900">RESUMO</text>`;
  const subtitleCopy=scene.visual==='WATCHLIST'?'Cinco confrontos para acompanhar. Veja a agenda completa no LivaSports.com.':scene.subtitle;
  const footerSize=Math.max(20,Math.min(28,Math.floor(850/Math.max(1,fixture.competition.name.length*.55))));
  const foreground=`${contextStrip}${characterMode?`<text x="540" y="1158" text-anchor="middle" fill="#cadbd5" font-family="Arial" font-size="17" letter-spacing="2">PERSONAGENS LIVA · ARTE ORIGINAL</text>`:''}`+
    `${options.master&&scene.visual==='HOOK'?`<text x="540" y="1302" text-anchor="middle" fill="#edf5f1" font-family="Arial" font-size="25">${escape(brazilKickoff(fixture.kickoff))}</text>`:''}`+
    `${scene.visual==='CTA'?playLivaPromoSvg(draft.creative?.promo??'DISCOVER'):''}${subtitle}`+
    `${fittedSubtitle(subtitleCopy,channel==='TIKTOK'?112:540,VIDEO.subtitleTop+(channel==='YOUTUBE_SHORTS'?120:105),channel==='TIKTOK'?'start':'middle')}`+
    `<text x="540" y="1770" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="${footerSize}" font-weight="800">${escape(fixture.competition.name)} · ${scene.order}</text>`;
  const defs=`${sceneryDefs('sc',family)}<radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`;
  return {family,characterMode,
    background:svgDocument(`${scenery}${geometry}`,defs,{width:Math.round(VIDEO.width*BLEED),height:Math.round(VIDEO.height*BLEED)}),
    headline:svgDocument(fittedBlock(scene.headline,channel==='INSTAGRAM_REELS'?540:76,280,channel==='INSTAGRAM_REELS'?'middle':'start',visualAssets)),
    left:svgDocument(characterMode?characterSide(0):crestSide(0)),right:svgDocument(characterMode?characterSide(1):crestSide(1)),
    center:center.map(piece=>svgDocument(piece)),foreground:svgDocument(foreground)};
}

/** The team-versus-team separator: always "VS", LivaSports dark disc with the accent ring and glyph. */
export function versusMedallion(cx:number,cy:number,accent:string){
  return `<g data-versus="VS"><circle cx="${cx}" cy="${cy}" r="44" fill="#06131cf2" stroke="${accent}" stroke-width="4"/>`+
    `<text x="${cx}" y="${cy+13}" text-anchor="middle" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="37" font-weight="900" letter-spacing="1">VS</text></g>`;
}
function versusPill(cx:number,cy:number,accent:string){
  return `<g data-versus="VS"><rect x="${cx-33}" y="${cy-27}" width="66" height="54" rx="27" fill="#06131cf2" stroke="${accent}" stroke-width="3"/>`+
    `<text x="${cx}" y="${cy+11}" text-anchor="middle" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" letter-spacing="1">VS</text></g>`;
}

/** Background family for a scene: the stored creative choice first, the deterministic pick otherwise. */
function sceneFamily(scene:GrowthVideoScene,fixture:GrowthFixtureSnapshot,draft:GrowthPlatformDraft):SceneryFamily{
  const stored=draft.creative?.scenery[scene.order-1] as SceneryFamily|undefined;
  return stored&&SCENERY_FAMILIES.includes(stored)?stored:pickScenery(fixture.fixtureId,scene.template,draft.channel,scene.order);
}

const PROGRESS={x:76,y:1830,width:928,height:10} as const;
/** Static pieces that persist across every cut: lockup and label, top rule, progress track, Shorts edge bar. */
function chromeSvgs(channel:GrowthVideoChannel,master=false):string[]{
  const topLabel=master?'FUTEBOL · DADOS · ODDS':channel==='TIKTOK'?'RÁPIDO E DIRETO':channel==='INSTAGRAM_REELS'?'EM CAMPO':'GUIA EM 5 CENAS';
  const pieces=[
    `${livaSportsLockupSvg({x:76,y:78,size:34})}<text x="1000" y="112" text-anchor="end" fill="${BRAND.livasports.muted}" font-family="Arial" font-size="21" letter-spacing="4">${topLabel}</text><rect x="76" y="154" width="928" height="3" fill="#2a4959"/>`,
    `<rect x="${PROGRESS.x}" y="${PROGRESS.y}" width="${PROGRESS.width}" height="${PROGRESS.height}" rx="5" fill="#06131c" fill-opacity=".55" stroke="#345463" stroke-width="2"/>`,
  ];
  if(channel==='YOUTUBE_SHORTS'&&!master)pieces.push(`<rect x="0" width="24" height="1920" fill="${BRAND.livasports.accent}"/>`);
  return pieces.map(piece=>svgDocument(piece));
}

/** Flattened still of one scene at rest — the same layers the video animates, for QA frames and tests. */
export async function growthSceneSvg(scene:GrowthVideoScene,fixture:GrowthFixtureSnapshot,draft:GrowthPlatformDraft,options:VideoRendererOptions={}){
  const layers=await sceneLayerSvgs(scene,fixture,draft,options);
  const inner=(svg:string)=>svg.replace(/^<svg[^>]*><defs>[\s\S]*?<\/defs>/,'').replace(/<\/svg>$/,'');
  const defs=/<defs>([\s\S]*?)<\/defs>/.exec(layers.background)?.[1]??'';
  const staticProgress=`<rect x="${PROGRESS.x}" y="${PROGRESS.y}" width="${Math.round(PROGRESS.width*(scene.order/5))}" height="${PROGRESS.height}" rx="5" fill="${BRAND.livasports.accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO.width}" height="${VIDEO.height}" viewBox="0 0 ${VIDEO.width} ${VIDEO.height}"><defs>${defs}</defs>`+
    [layers.background,layers.headline,layers.left,layers.right,...layers.center,layers.foreground].map(inner).join('')+
    chromeSvgs(draft.channel,options.master).map(inner).join('')+staticProgress+'</svg>';
}

// ---------------------------------------------------------------------------------------------
// Rasterisation
// ---------------------------------------------------------------------------------------------
/** Rasterise a transparent layer and keep only its painted bounding box, so overlays stay cheap. */
async function rasterLayer(svg:string,file:string):Promise<PlacedLayer|null>{
  const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=info;let top=height,bottom=-1,left=width,right=-1;
  for(let y=0;y<height;y++){const row=y*width*4;let seen=false;
    for(let x=0;x<width;x++)if(data[row+x*4+3]!==0){seen=true;if(x<left)left=x;break;}
    if(!seen)continue;if(y<top)top=y;bottom=y;
    for(let x=width-1;x>=0;x--)if(data[row+x*4+3]!==0){if(x>right)right=x;break;}
  }
  if(bottom<0)return null;
  // Even geometry keeps 4:2:0 chroma aligned when FFmpeg converts the layer to YUVA.
  left=Math.max(0,left-(left%2));top=Math.max(0,top-(top%2));
  const w=Math.min(width-left,right-left+2+((right-left+2)%2)),h=Math.min(height-top,bottom-top+2+((bottom-top+2)%2));
  await sharp(data,{raw:{width,height,channels:4}}).extract({left,top,width:w,height:h}).png({compressionLevel:1}).toFile(file);
  return {path:file,x:left,y:top,width:w,height:h};
}

/** Shared atmosphere and transition art, drawn once per process — deterministic, original, rights-free. */
function atmosphereSvgs():Record<string,{svg:string;x:number;y:number}>{
  const accent=BRAND.livasports.accent;
  const flashes=(seed:number)=>{let value=seed;const next=()=>{value=Math.imul(value^(value>>>15),2246822507)>>>0;value=(value+0x9e3779b9)>>>0;return value/4294967296;};
    return Array.from({length:34},()=>{const x=20+next()*1040,y=20+next()*420,r=1.6+next()*2.4;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r*4).toFixed(1)}" fill="url(#flash)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffffff" opacity=".85"/>`;}).join('');};
  const flashDefs=`<radialGradient id="flash"><stop offset="0" stop-color="#ffffff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
  return {
    // Floodlight sweep: a narrow skewed band crossing the upper frame once per scene.
    LIGHT_SWEEP:{x:0,y:0,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1320"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#e9fff6" stop-opacity=".14"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".8" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="m"><rect width="360" height="1320" fill="url(#v)"/></mask></defs><path d="M120 0 H300 L240 1320 H60Z" fill="url(#g)" mask="url(#m)"/></svg>`},
    HAZE:{x:-10,y:300,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="560"><defs><radialGradient id="h"><stop offset="0" stop-color="#dff7ee" stop-opacity=".10"/><stop offset="1" stop-color="#dff7ee" stop-opacity="0"/></radialGradient><radialGradient id="t"><stop offset="0" stop-color="${accent}" stop-opacity=".07"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><ellipse cx="330" cy="250" rx="330" ry="190" fill="url(#h)"/><ellipse cx="780" cy="330" rx="320" ry="200" fill="url(#t)"/><ellipse cx="560" cy="200" rx="240" ry="130" fill="url(#h)"/></svg>`},
    // Phone lights and camera flashes in the stands: two sparse sets that alternate.
    CROWD_SHIMMER:{x:0,y:540,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="460"><defs>${flashDefs}</defs>${flashes(7)}</svg>`},
    CROWD_SHIMMER_B:{x:0,y:540,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="460"><defs>${flashDefs}</defs>${flashes(19)}</svg>`},
    TUNNEL_GLOW:{x:190,y:560,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="520"><defs><radialGradient id="g"><stop offset="0" stop-color="#e8fff6" stop-opacity=".20"/><stop offset=".45" stop-color="${accent}" stop-opacity=".08"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><ellipse cx="350" cy="260" rx="350" ry="260" fill="url(#g)"/></svg>`},
    EDITORIAL_LINES:{x:-60,y:360,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520">${Array.from({length:8},(_,i)=>`<path d="M${i*160} 520 L${i*160+290} 0" stroke="#ffffff" stroke-opacity=".05" stroke-width="2"/>`).join('')}<path d="M0 360 L1200 230" stroke="${accent}" stroke-opacity=".10" stroke-width="3"/></svg>`},
    PITCH_GLIDE:{x:0,y:1180,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="480">${[0,1,2].map(i=>`<rect x="0" y="${i*160}" width="1080" height="72" fill="#ffffff" opacity=".022"/>`).join('')}<path d="M0 260 H1080" stroke="#ffffff" stroke-opacity=".08" stroke-width="4"/></svg>`},
  };
}
let sharedArt:Promise<Map<string,{png:Buffer;x:number;y:number;width:number;height:number}>>|undefined;
function sharedArtwork(){
  return sharedArt??=(async()=>{
    const out=new Map<string,{png:Buffer;x:number;y:number;width:number;height:number}>();
    for(const [key,value] of Object.entries(atmosphereSvgs())){
      const image=sharp(Buffer.from(value.svg)),meta=await image.metadata();
      out.set(key,{png:await image.png({compressionLevel:1}).toBuffer(),x:value.x,y:value.y,width:meta.width!,height:meta.height!});
    }
    const fill=await sharp({create:{width:PROGRESS.width,height:PROGRESS.height,channels:4,background:BRAND.livasports.accent}}).png().toBuffer();
    out.set('PROGRESS_FILL',{png:fill,x:0,y:0,width:PROGRESS.width,height:PROGRESS.height});
    return out;
  })().catch(error=>{sharedArt=undefined;throw error;});
}
async function writeShared(directory:string,channel:GrowthVideoChannel,master=false):Promise<SharedLayers>{
  const art=await sharedArtwork(),place=async(key:string)=>{const item=art.get(key)!,path=join(directory,`shared-${key.toLowerCase()}.png`);await writeFile(path,item.png);return {path,x:item.x,y:item.y,width:item.width,height:item.height};};
  const atmosphere:SharedLayers['atmosphere']={};
  for(const key of ['LIGHT_SWEEP','HAZE','CROWD_SHIMMER','CROWD_SHIMMER_B','TUNNEL_GLOW','EDITORIAL_LINES','PITCH_GLIDE'] as const)atmosphere[key]=await place(key);
  const chrome:PlacedLayer[]=[];
  for(const [index,svg] of chromeSvgs(channel,master).entries()){const layer=await rasterLayer(svg,join(directory,`chrome-${index}.png`));if(layer)chrome.push(layer);}
  return {chrome,progressFill:(await place('PROGRESS_FILL')).path,atmosphere};
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

interface NarrationAudio {narration:NarrationResult;files:Array<{path:string;order:number;seconds:number}>;}
const durationOf=(probe:string)=>{const match=/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe);return match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):null;};
/** Synthesise (or reuse) the draft's scene voiceovers and stage them as files FFmpeg can place. */
async function buildNarrationAudio(draft:GrowthPlatformDraft,directory:string,options:VideoRendererOptions):Promise<NarrationAudio>{
  const mode=CHANNEL_VOICE[draft.channel];
  const lines=draft.scenes.map(scene=>({order:scene.order,startSeconds:scene.startSeconds,text:scene.voiceover}));
  const narration=await narrateScenes(lines,mode,{provider:options.voice,cache:options.voiceCache,store:options.voiceStore,deadlineMs:options.deadlineMs});
  const files:NarrationAudio['files']=[];
  for(const line of narration.clips){
    const path=join(directory,`voice-${line.order}.mp3`);
    await writeFile(path,line.clip.data);
    const seconds=durationOf(await runFfmpeg(options.ffmpeg??ffmpegPath!,['-hide_banner','-i',path,'-f','null','-'],options.deadlineMs));
    if(seconds===null)throw new Error('VOICE_DURATION_UNKNOWN');
    if(seconds>10)throw new Error('VOICE_LINE_EXCEEDS_SCENE_BUDGET');
    files.push({path,order:line.order,seconds});
  }
  return {narration,files};
}

/** Library files are bundled under public/; a missing file degrades to a lighter mix, never a failure. */
async function audioFile(id:keyof typeof AUDIO_FILES):Promise<string|null>{
  const path=join(process.cwd(),'public/growth/audio',AUDIO_LIBRARY_VERSION,AUDIO_FILES[id]);
  try{await access(path);return path;}catch{return null;}
}
let provenance:Promise<Map<string,{sha256:string;license:string}>>|undefined;
function audioProvenance(){
  return provenance??=readFile(join(process.cwd(),'public/growth/audio',AUDIO_LIBRARY_VERSION,'PROVENANCE.json'),'utf8')
    .then(text=>new Map((JSON.parse(text) as {items:Array<{file:string;sha256:string;license:string}>}).items.map(item=>[item.file,{sha256:item.sha256,license:item.license}])))
    .catch(()=>new Map());
}

export async function renderGrowthVideo(draft:GrowthPlatformDraft,fixture:GrowthFixtureSnapshot,options:VideoRendererOptions={}):Promise<RenderedGrowthVideo>{
  const started=Date.now(),fps=options.fps??VIDEO.fps;
  options={...options,deadlineMs:options.deadlineMs??started+90_000};
  if(started>=options.deadlineMs!)throw new Error('RENDER_BUDGET_EXCEEDED');
  await verifyGrowthGlyphs();
  const binary=options.ffmpeg??ffmpegPath;if(!binary)throw new Error('FFMPEG_UNAVAILABLE');
  const directory=await mkdtemp(join(tmpdir(),'livasports-growth-')),output=join(directory,`${draft.channel.toLowerCase()}.mp4`);
  const stages={narrationMs:0,layersMs:0,audioMs:0,encodeMs:0};let mark=Date.now();
  const lap=(stage:keyof typeof stages)=>{const now=Date.now();stages[stage]+=now-mark;mark=now;};
  try{
    const audio=await buildNarrationAudio(draft,directory,options);lap('narrationMs');
    if(options.requireNarration&&(audio.narration.degradedReason||audio.files.length!==draft.scenes.length))throw new Error('NARRATION_INCOMPLETE_KEEP_PREDECESSOR');
    const families=draft.scenes.map(scene=>sceneFamily(scene,fixture,draft));
    const plan=alignTransitions(options.master?planMasterMotion(draft.scenes,fixture.fixtureId,families):planMotion(draft.channel,draft.scenes,fixture.fixtureId,families),fps);
    const mode=CHANNEL_VOICE[draft.channel],pacing=VOICE_PACING[mode];
    const timeline=sceneTimeline(draft.scenes,plan.transitions,new Map(audio.files.map(file=>[file.order,file.seconds])),{fps,lead:pacing.leadSeconds,tail:pacing.tailSeconds});
    const totalSeconds=timeline.totalSeconds;
    if(totalSeconds>45)throw new Error('VOICE_VIDEO_EXCEEDS_DURATION_BUDGET');
    const timedScenes=draft.scenes.map((scene,index)=>({...scene,startSeconds:timeline.scenes[index]!.startSeconds,durationSeconds:timeline.scenes[index]!.durationSeconds}));
    // Layers: rasterised once each, cropped to what they paint.
    let drawnCharacters=false;
    const prepared:PreparedScene[]=[];
    for(const scene of timedScenes){
      if(Date.now()>=options.deadlineMs!)throw new Error('RENDER_BUDGET_EXCEEDED');
      const layers=await sceneLayerSvgs(scene,fixture,draft,options),base=join(directory,`scene-${scene.order}`);
      drawnCharacters||=layers.left.includes('data-liva-character=')||layers.right.includes('data-liva-character=');
      const background=`${base}-bg.png`;
      await sharp(Buffer.from(layers.background)).flatten({background:'#041218'}).png({compressionLevel:1}).toFile(background);
      const [headline,left,right,foreground,...center]=await Promise.all([
        rasterLayer(layers.headline,`${base}-headline.png`),rasterLayer(layers.left,`${base}-left.png`),rasterLayer(layers.right,`${base}-right.png`),
        rasterLayer(layers.foreground,`${base}-fg.png`),...layers.center.map((svg,index)=>rasterLayer(svg,`${base}-center-${index}.png`))]);
      prepared.push({order:scene.order,background,headline:headline??null,left:left??null,right:right??null,foreground:foreground??null,center:center.filter((layer):layer is PlacedLayer=>!!layer)});
    }
    const shared=await writeShared(directory,draft.channel,options.master);lap('layersMs');
    const graph=buildMotionGraph({width:VIDEO.width,height:VIDEO.height,fps,bleed:BLEED,plan,timeline:timeline.scenes,totalSeconds,scenes:prepared,shared,progress:PROGRESS});
    // Sound: deterministic direction, voice placed inside each scene's clean window, beds ducked under it.
    const direction=draft.creative?.audio??selectAudioDirection({channel:draft.channel,angle:draft.template,family:draft.creative?.family??null,fixtureSeed:fixture.fixtureId});
    const cta=timedScenes.find(scene=>scene.visual==='CTA');
    const placements=placeEffects(draft.channel,direction.sfxKit,plan.transitions,graph.transitionOffsets,totalSeconds,cta?.startSeconds??totalSeconds);
    const [music,ambience]=await Promise.all([audioFile(direction.music),audioFile(direction.ambience)]);
    const effects=(await Promise.all(placements.map(async placement=>{const path=await audioFile(placement.id);return path?{...placement,path}:null;}))).filter(effect=>!!effect);
    const voice=audio.files.map(file=>({path:file.path,seconds:file.seconds,atSeconds:timeline.scenes.find(scene=>scene.order===file.order)!.voiceStartSeconds}));
    let mixed:string|null=null,mixMetadata:GrowthRenderMetadata['audio']|undefined;
    if(voice.length||music||ambience){
      const mixWav=join(directory,'mix.wav'),mixOut=join(directory,'mix.m4a');
      const mix=buildMixGraph({channel:draft.channel,totalSeconds,voice,music,ambience,effects,output:mixWav});
      await runFfmpeg(binary,mix.args,options.deadlineMs);
      // Two-pass loudness: measure, then apply one linear gain — speech is never pumped by a dynamic normaliser.
      const measured=parseLoudnorm(await runFfmpeg(binary,['-hide_banner','-nostdin','-i',mixWav,'-af',loudnormFilter(),'-f','null','-'],options.deadlineMs));
      const final=parseLoudnorm(await runFfmpeg(binary,['-hide_banner','-nostdin','-i',mixWav,'-af',`${loudnormFilter(measured??undefined)},alimiter=limit=0.89:level=false,aresample=44100`,
        '-c:a','aac','-b:a','128k','-ac','2','-ar','44100','-y',mixOut],options.deadlineMs));
      mixed=mixOut;
      const known=await audioProvenance(),source=(id:keyof typeof AUDIO_FILES|null)=>{if(!id)return null;const file=AUDIO_FILES[id],entry=known.get(file);
        return {id,file,sha256:entry?.sha256??null,origin:'ORIGINAL_PROCEDURAL' as const,license:entry?.license??'Original LivaSports work'};};
      mixMetadata={library:AUDIO_LIBRARY_VERSION,direction,
        music:music?source(direction.music):null,ambience:ambience?source(direction.ambience):null,
        effects:effects.map(effect=>({id:effect.id,atSeconds:Math.round(effect.atSeconds*1000)/1000,gainDb:effect.gainDb})),
        mix:{hierarchy:'VOICE>MUSIC>AMBIENCE',targetLufs:MIX.targetLufs,truePeakCeilingDb:MIX.truePeakDb,
          musicDb:MIX.musicDb[draft.channel],ambienceDb:MIX.ambienceDb[draft.channel],sfxDb:MIX.sfxDb[draft.channel],ducking:MIX.duck,
          measuredInputLufs:measured?Number(measured.input_i):null,outputLufs:final?.output_i?Number(final.output_i):null,
          outputTruePeakDb:final?.output_tp?Number(final.output_tp):null,loudnessRange:final?.output_lra?Number(final.output_lra):null}};
    }
    lap('audioMs');
    const args:string[]=['-hide_banner','-nostdin'];for(const input of graph.inputs)args.push(...input);
    if(mixed)args.push('-i',mixed);
    // File input avoids Windows command-line limits and keeps the identical graph on Vercel.
    const graphFile=join(directory,'video-filter.txt');await writeFile(graphFile,graph.filter);
    args.push('-filter_threads','1','-filter_complex_threads','1','-filter_complex_script',graphFile,'-map',`[${graph.videoLabel}]`);
    if(mixed)args.push('-map',`${graph.inputs.length}:a`,'-c:a','copy');else args.push('-an');
    const maxVideoKbps=Math.floor(VIDEO.maxRenderBytes*8*.88/totalSeconds/1000-128);
    args.push('-t',totalSeconds.toFixed(3),'-c:v','libx264','-preset',VIDEO.preset,'-threads','1','-crf',String(VIDEO.crf),'-maxrate',`${maxVideoKbps}k`,'-bufsize',`${maxVideoKbps*2}k`,
      '-pix_fmt','yuv420p','-r',String(fps),'-fps_mode','cfr','-movflags','+faststart','-y',output);
    await runFfmpeg(binary,args,options.deadlineMs);lap('encodeMs');const data=await readFile(output);if(!data.length||data.length>VIDEO.maxRenderBytes)throw new Error('VIDEO_SIZE_INVALID');
    const voiceState={mode:audio.narration.mode,provider:audio.narration.provider,lines:audio.files.length,degradedReason:audio.narration.degradedReason,
      ...(audio.narration.voiceId?{voiceId:audio.narration.voiceId}:{}),...(audio.narration.cache?{cache:audio.narration.cache}:{})};
    return {channel:draft.channel,status:'READY',mimeType:'video/mp4',sha256:createHash('sha256').update(data).digest('hex'),byteLength:data.length,data,voice:voiceState,
      renderMetadata:{voice:voiceState,characterMode:drawnCharacters?'LIVA_ORIGINAL':draft.creative?.characters==='LIVA_ORIGINAL'?'CREST_FALLBACK':'NONE',
        scenery:draft.creative?.scenery??families,durationSeconds:Math.round(totalSeconds*1000)/1000,renderMs:Date.now()-started,stages,
        sceneTiming:timeline.scenes.map(scene=>({order:scene.order,startSeconds:Math.round(scene.startSeconds*1000)/1000,durationSeconds:Math.round(scene.durationSeconds*1000)/1000,
          audioSeconds:Math.round(scene.audioSeconds*1000)/1000,voiceStartSeconds:Math.round(scene.voiceStartSeconds*1000)/1000})),
        motion:{version:MOTION_VERSION,grammar:plan.grammar,fps,transitions:plan.transitions.map(transition=>transition.family),
          atmosphere:plan.scenes.map(scene=>scene.atmosphere),bleed:BLEED,encoder:{preset:VIDEO.preset,crf:VIDEO.crf,maxVideoKbps}},
        ...(mixMetadata?{audio:mixMetadata}:{})}};
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
  // One 1080×1920 encoder at a time fits the serverless memory budget; three parallel FFmpeg processes
  // do not. Keep platform output deterministic, reuse media across variants and bound peak memory.
  for(const channel of channels){try{results.push(await renderGrowthVideo(drafts[channel],fixture,batchOptions));}catch(error){results.push({channel,status:'FAILED',mimeType:null,sha256:null,byteLength:null,data:null,
    errorCode:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'VIDEO_RENDER_FAILED'});}}
  return results;
}
