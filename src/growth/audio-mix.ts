import {MIX,type SfxPlacement} from './audio-design';
import type {GrowthVideoChannel} from './config';

/**
 * Voice-led mix graph. Pure: returns FFmpeg arguments, the caller runs them.
 *
 * Hierarchy is structural, not a matter of taste per render: every bed (music, ambience, effects) is
 * summed first and then side-chain ducked by the narration bus, so the voice always wins; the final
 * mix is loudness-normalised in two passes (measure, then linear gain) so speech is never pumped by a
 * dynamic normaliser, and a true-peak limiter guarantees no clipping.
 */

export interface VoicePlacement {path:string;atSeconds:number;seconds:number;}
export interface MixInput {
  channel:GrowthVideoChannel;totalSeconds:number;
  voice:VoicePlacement[];
  music:string|null;ambience:string|null;
  effects:Array<SfxPlacement&{path:string}>;
  output:string;
}
const f=(value:number)=>Number(value.toFixed(3)).toString();
const FORMAT='aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';

export function buildMixGraph(input:MixInput):{args:string[];stems:{voice:number;music:boolean;ambience:boolean;effects:number}}{
  const args:string[]=['-hide_banner','-nostdin'],filters:string[]=[];let index=0;
  const total=input.totalSeconds;
  const voiced=input.voice.length>0;
  const voiceLabels=input.voice.map((clip,clipIndex)=>{
    args.push('-i',clip.path);const label=`v${clipIndex}`,delay=Math.round(clip.atSeconds*1000);
    // Short fades remove the click of a hard-edged synthesis boundary without touching the words.
    const fadeOut=Math.max(0,clip.seconds-MIX.voiceFadeOutMs/1000);
    filters.push(`[${index++}:a]${FORMAT},afade=t=in:st=0:d=${f(MIX.voiceFadeInMs/1000)},afade=t=out:st=${f(fadeOut)}:d=${f(MIX.voiceFadeOutMs/1000)},adelay=${delay}|${delay}[${label}]`);
    return label;
  });
  const beds:string[]=[];
  // Without narration the bed carries the video, so it comes up a little; with narration it sits under.
  const lift=voiced?0:4;
  if(input.music){
    args.push('-stream_loop','-1','-i',input.music);
    filters.push(`[${index++}:a]${FORMAT},atrim=0:${f(total)},asetpts=N/SR/TB,volume=${f(MIX.musicDb[input.channel]+lift)}dB,afade=t=in:st=0:d=0.35,afade=t=out:st=${f(Math.max(0,total-1.3))}:d=1.3[music]`);
    beds.push('music');
  }
  if(input.ambience){
    args.push('-stream_loop','-1','-i',input.ambience);
    filters.push(`[${index++}:a]${FORMAT},atrim=0:${f(total)},asetpts=N/SR/TB,volume=${f(MIX.ambienceDb[input.channel]+lift)}dB,afade=t=in:st=0:d=0.8,afade=t=out:st=${f(Math.max(0,total-1))}:d=1[amb]`);
    beds.push('amb');
  }
  input.effects.forEach((effect,effectIndex)=>{
    args.push('-i',effect.path);const delay=Math.round(effect.atSeconds*1000);
    filters.push(`[${index++}:a]${FORMAT},adelay=${delay}|${delay},volume=${f(effect.gainDb)}dB[fx${effectIndex}]`);
    beds.push(`fx${effectIndex}`);
  });
  // A silent anchor fixes the mix length exactly to the picture, whatever the stems contain.
  filters.push(`anullsrc=r=44100:cl=stereo,atrim=0:${f(total)}[anchor]`);
  filters.push(`[anchor]${beds.map(label=>`[${label}]`).join('')}amix=inputs=${beds.length+1}:normalize=0:duration=first[beds]`);
  if(voiced){
    filters.push(`${voiceLabels.map(label=>`[${label}]`).join('')}amix=inputs=${voiceLabels.length}:normalize=0:duration=longest,`+
      // Gentle speech polish: rumble cut and light levelling; no heavy processing that reads as synthetic.
      `highpass=f=75,acompressor=threshold=-20dB:ratio=2.2:attack=8:release=140:makeup=1.4,apad=whole_dur=${f(total)},atrim=0:${f(total)}[voicebus]`);
    filters.push(`[voicebus]asplit=2[voice][key]`);
    filters.push(`[beds][key]sidechaincompress=threshold=${MIX.duck.threshold}:ratio=${MIX.duck.ratio}:attack=${MIX.duck.attackMs}:release=${MIX.duck.releaseMs}[ducked]`);
    filters.push(`[voice][ducked]amix=inputs=2:normalize=0:duration=first[mix]`);
  }else filters.push(`[beds]anull[mix]`);
  args.push('-filter_complex',filters.join(';'),'-map','[mix]','-t',f(total),'-c:a','pcm_s16le','-ar','44100','-ac','2','-y',input.output);
  return {args,stems:{voice:input.voice.length,music:!!input.music,ambience:!!input.ambience,effects:input.effects.length}};
}

export interface LoudnessMeasurement {input_i:string;input_tp:string;input_lra:string;input_thresh:string;target_offset:string;output_i?:string;output_tp?:string;output_lra?:string;}
export const loudnormFilter=(measured?:LoudnessMeasurement)=>`loudnorm=I=${MIX.targetLufs}:TP=${MIX.truePeakDb}:LRA=11:print_format=json`+
  (measured?`:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`:'');
/** loudnorm prints its JSON report last on stderr. */
export function parseLoudnorm(stderr:string):LoudnessMeasurement|null{
  const match=/\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);if(!match)return null;
  try{const value=JSON.parse(match[0]) as LoudnessMeasurement;return Number.isFinite(Number(value.input_i))?value:null;}catch{return null;}
}
