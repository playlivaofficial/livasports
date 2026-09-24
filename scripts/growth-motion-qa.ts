/**
 * Premium Motion QA — renders a Top 5 × 3 platforms set through the production renderer and writes
 * contact sheets (one row per video, one frame per scene), transition strips and VS close-ups.
 *
 *   node --import ./scripts/growth-cli-preload-qa.mjs --import tsx scripts/growth-motion-qa.ts [--voice]
 *
 * Offline by default: fixtures are local QA fixtures (real club and competition names, synthetic
 * kickoff/table data), crests are neutral generated shields, and narration is a generated tone of the
 * right length so no ElevenLabs credit is spent. `--voice` uses the configured provider (and the
 * durable cache, when DATABASE_URL is set) for a real voiced pass.
 */
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import {generateV11ContentPack,fixtureSnapshot} from '../src/growth/content';
import {rankedFixture} from '../src/growth/fixtures.test-support';
import {renderGrowthVideos} from '../src/growth/video-renderer';
import type {VoiceProvider} from '../src/growth/voice';

const OUT=join(process.cwd(),'output/motion-qa');mkdirSync(OUT,{recursive:true});
const ff=ffmpegPath!;
const run=(args:string[])=>{const result=spawnSync(ff,['-hide_banner','-loglevel','error',...args]);if(result.status!==0)throw new Error(String(result.stderr));};

const FIXTURES=[
  {home:['flamengo','Flamengo'],away:['palmeiras','Palmeiras'],competition:['brasileirao-serie-a','Brasileirão Série A'],standings:{homePosition:1,awayPosition:2,totalTeams:20}},
  {home:['corinthians','Corinthians'],away:['sao-paulo','São Paulo'],competition:['brasileirao-serie-a','Brasileirão Série A'],standings:{homePosition:9,awayPosition:6,totalTeams:20}},
  {home:['novorizontino','Novorizontino'],away:['sao-bernardo','São Bernardo'],competition:['brasileirao-serie-b','Brasileirão Série B'],standings:{homePosition:3,awayPosition:15,totalTeams:20}},
  {home:['gremio','Grêmio'],away:['internacional','Internacional'],competition:['copa-do-brasil','Copa do Brasil'],standings:null},
  {home:['atletico-mineiro','Atlético Mineiro'],away:['cruzeiro','Cruzeiro'],competition:['brasileirao-serie-a','Brasileirão Série A'],standings:{homePosition:11,awayPosition:5,totalTeams:20}},
] as const;

async function shield(color:string){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><path d="M150 12 L270 52 V150 C270 222 214 270 150 290 C86 270 30 222 30 150 V52Z" fill="${color}" stroke="#ffffff" stroke-width="10"/><circle cx="150" cy="150" r="54" fill="#ffffff" opacity=".85"/></svg>`;
  return `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')}`;
}
function toneVoice():VoiceProvider{
  const cache=new Map<number,Buffer>();
  const clip=(seconds:number)=>{if(!cache.has(seconds)){const file=join(OUT,`tone-${seconds}.mp3`);run(['-f','lavfi','-i',`sine=frequency=210:duration=${seconds}`,'-af','volume=0.35','-ac','1','-y',file]);cache.set(seconds,readFileSync(file));}return cache.get(seconds)!;};
  // Duration grows with the line, like speech (~15 characters per second).
  return {id:'qa-tone',available:()=>true,voiceFor:()=>'qa-tone',synthesize:async(text,mode)=>({mode,mimeType:'audio/mpeg',data:clip(Math.min(6.5,Math.max(1.4,Math.round(text.length/15*10)/10))),sha256:'0'.repeat(64)})};
}

async function main(){
  const voiced=process.argv.includes('--voice');
  const [homeCrest,awayCrest]=await Promise.all([shield('#b3202a'),shield('#1d6b3a')]);
  const rows=FIXTURES.map((fixture,index)=>rankedFixture({fixtureId:`qa-fixture-${index+1}`,publicId:`${index+1}`.repeat(16).slice(0,16),kickoff:new Date(Date.UTC(2026,8,26+index,19,30)).toISOString(),
    competitionSlug:fixture.competition[0],competitionName:fixture.competition[1],
    home:{slug:fixture.home[0],name:fixture.home[1],publicId:'a'.repeat(15)+index,imageUrl:'https://cdn.sportmonks.com/qa/home.png'},
    away:{slug:fixture.away[0],name:fixture.away[1],publicId:'b'.repeat(15)+index,imageUrl:'https://cdn.sportmonks.com/qa/away.png'},
    standings:fixture.standings?{...fixture.standings}:null}));
  const manifest:Record<string,unknown>[]=[];const sheets:string[]=[];
  for(const [index,row] of rows.entries()){
    const pack=generateV11ContentPack(row,index+1,rows);
    const videos=await renderGrowthVideos(pack.platforms!,fixtureSnapshot(row),{assetLoader:async url=>url.includes('home')?homeCrest:awayCrest,...(voiced?{}:{voice:toneVoice()})});
    for(const video of videos){
      if(video.status!=='READY'){manifest.push({rank:index+1,channel:video.channel,status:video.status,error:video.errorCode});continue;}
      const name=`${index+1}-${video.channel.toLowerCase()}`,file=join(OUT,`${name}.mp4`);writeFileSync(file,video.data);
      const meta=video.renderMetadata!,draft=pack.platforms![video.channel];
      // One frame at the middle of each scene's clean window.
      const moments=meta.sceneTiming.map(scene=>scene.startSeconds+scene.durationSeconds/2);
      const frames=moments.map((at,sceneIndex)=>{const out=join(OUT,`${name}-s${sceneIndex+1}.png`);run(['-ss',at.toFixed(2),'-i',file,'-frames:v','1','-vf','scale=270:480','-update','1','-y',out]);return out;});
      const sheet=join(OUT,`${name}-sheet.png`);
      await sharp({create:{width:270*frames.length+8*(frames.length-1),height:480,channels:3,background:'#000'}}).composite(frames.map((input,i)=>({input,left:i*278,top:0}))).png().toFile(sheet);
      sheets.push(sheet);
      manifest.push({rank:index+1,match:`${row.signals.home.name} vs ${row.signals.away.name}`,channel:video.channel,file,bytes:video.byteLength,
        story:pack.story?.angle,visuals:draft.scenes.map(scene=>scene.visual),characters:meta.characterMode,motion:meta.motion,audio:meta.audio,voice:meta.voice,
        durationSeconds:meta.durationSeconds,renderMs:meta.renderMs,stages:meta.stages,sceneTiming:meta.sceneTiming,headlines:draft.scenes.map(scene=>scene.headline)});
      console.info(JSON.stringify({rank:index+1,channel:video.channel,characters:meta.characterMode,transitions:meta.motion?.transitions,music:meta.audio?.direction.music,
        lufs:meta.audio?.mix.outputLufs,tp:meta.audio?.mix.outputTruePeakDb,seconds:meta.durationSeconds,renderMs:meta.renderMs,mb:(video.byteLength/1e6).toFixed(2)}));
    }
  }
  writeFileSync(join(OUT,'manifest.json'),JSON.stringify(manifest,null,2));
  console.info(JSON.stringify({event:'motion-qa-written',directory:OUT,videos:manifest.filter(item=>item.file).length,sheets:sheets.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
