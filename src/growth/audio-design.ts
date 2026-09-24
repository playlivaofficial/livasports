import type {GrowthVideoChannel} from './config';
import type {TransitionCue, TransitionPlan} from './motion';

/**
 * Premium Motion V1 — rights-safe sound design.
 *
 * Every file referenced here is an original, procedurally generated recording produced by
 * `scripts/growth-audio-generate.mjs` and listed with its SHA-256 in
 * `public/growth/audio/v1/PROVENANCE.json`. There are no samples, commercial songs or third-party
 * loops, so the provenance persisted with each render is complete: file id, hash and licence.
 *
 * Selection is deterministic (fixture, channel, story angle, creative family and recent history),
 * never random, and the mix hierarchy is fixed: voice > music > ambience, with sound effects short
 * and under the voice.
 */

export const AUDIO_LIBRARY_VERSION='v1' as const;
export const MUSIC_MOODS=['ENERGETIC','CINEMATIC_MATCH_NIGHT','PREMIUM_EDITORIAL','TENSION_BIG_MATCH'] as const;
export type MusicMood=typeof MUSIC_MOODS[number];
export const AMBIENCE_FAMILIES=['CROWD_BED','STADIUM_LOW'] as const;
export type AmbienceFamily=typeof AMBIENCE_FAMILIES[number];
export const SFX_IDS=['KICK_IMPACT','WHOOSH','TRANSITION_SWEEP','LIGHT_HIT','SPORTS_IMPACT','CROWD_SWELL','STADIUM_RISE'] as const;
export type SfxId=typeof SFX_IDS[number];

export const AUDIO_FILES:Readonly<Record<MusicMood|AmbienceFamily|SfxId,string>>={
  ENERGETIC:'music-energetic.m4a',CINEMATIC_MATCH_NIGHT:'music-cinematic-night.m4a',PREMIUM_EDITORIAL:'music-premium-editorial.m4a',TENSION_BIG_MATCH:'music-tension-bigmatch.m4a',
  CROWD_BED:'ambience-crowd-bed.m4a',STADIUM_LOW:'ambience-stadium-low.m4a',
  KICK_IMPACT:'sfx-kick-impact.m4a',WHOOSH:'sfx-whoosh.m4a',TRANSITION_SWEEP:'sfx-transition-sweep.m4a',LIGHT_HIT:'sfx-light-hit.m4a',
  SPORTS_IMPACT:'sfx-sports-impact.m4a',CROWD_SWELL:'sfx-crowd-swell.m4a',STADIUM_RISE:'sfx-stadium-rise.m4a',
};

/** SFX kits: the same cue slot resolves to a different sound per kit, so two videos never share an identical palette. */
export const SFX_KITS=['MATCHDAY','BROADCAST','CINEMATIC'] as const;
export type SfxKit=typeof SFX_KITS[number];
const KIT_CUES:Record<SfxKit,Record<Exclude<TransitionCue,'NONE'>,SfxId>&{open:SfxId;close:SfxId}>={
  MATCHDAY:{IMPACT:'KICK_IMPACT',WHOOSH:'WHOOSH',LIGHT_HIT:'LIGHT_HIT',SWEEP:'TRANSITION_SWEEP',open:'KICK_IMPACT',close:'CROWD_SWELL'},
  BROADCAST:{IMPACT:'SPORTS_IMPACT',WHOOSH:'TRANSITION_SWEEP',LIGHT_HIT:'LIGHT_HIT',SWEEP:'WHOOSH',open:'LIGHT_HIT',close:'LIGHT_HIT'},
  CINEMATIC:{IMPACT:'SPORTS_IMPACT',WHOOSH:'WHOOSH',LIGHT_HIT:'LIGHT_HIT',SWEEP:'TRANSITION_SWEEP',open:'STADIUM_RISE',close:'CROWD_SWELL'},
};

export interface AudioDirection {version:typeof AUDIO_LIBRARY_VERSION;music:MusicMood;ambience:AmbienceFamily;sfxKit:SfxKit;}

/** Mix levels in dB relative to full scale of each stem before loudness normalisation. */
export const MIX={
  voiceDb:0,
  /** Beds sit well below speech and are further ducked while the voice talks. */
  musicDb:{TIKTOK:-17,INSTAGRAM_REELS:-19,YOUTUBE_SHORTS:-22} as Record<GrowthVideoChannel,number>,
  ambienceDb:{TIKTOK:-24,INSTAGRAM_REELS:-25,YOUTUBE_SHORTS:-28} as Record<GrowthVideoChannel,number>,
  sfxDb:{TIKTOK:-12,INSTAGRAM_REELS:-15,YOUTUBE_SHORTS:-17} as Record<GrowthVideoChannel,number>,
  /** Sidechain: beds duck by up to ~9 dB under narration, recovering in 350 ms. */
  duck:{threshold:.035,ratio:5,attackMs:25,releaseMs:350},
  /** Social platforms normalise near -14 LUFS; -15 leaves a little headroom for their own limiter. */
  targetLufs:-15,truePeakDb:-1.5,
  voiceFadeInMs:14,voiceFadeOutMs:60,
} as const;

const seedOf=(value:string)=>{let hash=2166136261;for(let index=0;index<value.length;index++)hash=Math.imul(hash^value.charCodeAt(index),16777619);return hash>>>0;};

/** Which moods fit a story. The first entry is preferred; the rest keep a busy week from repeating. */
const MOOD_BY_ANGLE:Readonly<Record<string,readonly MusicMood[]>>={
  DERBY_RIVALRY:['TENSION_BIG_MATCH','CINEMATIC_MATCH_NIGHT','ENERGETIC'],
  BIG_MATCH:['CINEMATIC_MATCH_NIGHT','TENSION_BIG_MATCH','ENERGETIC'],
  TABLE_PRESSURE:['TENSION_BIG_MATCH','PREMIUM_EDITORIAL','CINEMATIC_MATCH_NIGHT'],
  ODDS_GAP:['PREMIUM_EDITORIAL','ENERGETIC'],
  PLAYER_VS_PLAYER:['ENERGETIC','CINEMATIC_MATCH_NIGHT','TENSION_BIG_MATCH'],
  STAR_FOCUS:['CINEMATIC_MATCH_NIGHT','ENERGETIC','PREMIUM_EDITORIAL'],
  TOP_MATCHES_TODAY:['ENERGETIC','PREMIUM_EDITORIAL','CINEMATIC_MATCH_NIGHT'],
  WEEKEND_WATCHLIST:['PREMIUM_EDITORIAL','ENERGETIC','CINEMATIC_MATCH_NIGHT'],
};
/** Platform bias: TikTok leans energetic, Reels editorial/cinematic, Shorts calm enough to read. */
const PLATFORM_MOOD_BIAS:Record<GrowthVideoChannel,readonly MusicMood[]>={
  TIKTOK:['ENERGETIC','TENSION_BIG_MATCH'],
  INSTAGRAM_REELS:['CINEMATIC_MATCH_NIGHT','PREMIUM_EDITORIAL'],
  YOUTUBE_SHORTS:['PREMIUM_EDITORIAL','CINEMATIC_MATCH_NIGHT'],
};

/**
 * Deterministic audio direction for one platform draft. `recent` is the channel's recent creative
 * history (newest first); a mood or kit used recently is penalised so consecutive days differ.
 */
export function selectAudioDirection(input:{channel:GrowthVideoChannel;angle:string;family?:string|null;fixtureSeed:string;rank?:number;
  recent?:ReadonlyArray<Partial<AudioDirection>|undefined>}):AudioDirection{
  const {channel,angle,fixtureSeed}=input,rank=input.rank??1,recent=(input.recent??[]).slice(0,6);
  const pool=MOOD_BY_ANGLE[angle]??MUSIC_MOODS,bias=PLATFORM_MOOD_BIAS[channel];
  const candidates=[...new Set([...pool,...bias])];
  // Rank rotation: neighbouring fixtures in one day's Top 5 start from different moods, so a batch of
  // same-angle stories (a derby-heavy weekend) cannot all ship on the same bed.
  const preferred=candidates[(rank-1+['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'].indexOf(channel))%candidates.length];
  const score=(mood:MusicMood)=>{const index=pool.indexOf(mood);
    return (index<0?0:(pool.length-index))+(bias.includes(mood)?2:0)+(mood===preferred?6:0)
      -recent.reduce((sum,item,age)=>sum+(item?.music===mood?(6-age)*3:0),0)+((seedOf(`${fixtureSeed}:${channel}:${mood}`))%3)*.25;};
  const music=candidates.map(mood=>({mood,value:score(mood)})).sort((a,b)=>b.value-a.value)[0]!.mood;
  const ambience:AmbienceFamily=music==='PREMIUM_EDITORIAL'||channel==='YOUTUBE_SHORTS'?'STADIUM_LOW'
    :music==='TENSION_BIG_MATCH'||input.family==='CHARACTER_FOOTBALL_WORLD'?'CROWD_BED':(seedOf(`${fixtureSeed}:amb`)+rank)%2?'CROWD_BED':'STADIUM_LOW';
  const kits=[...SFX_KITS].sort((a,b)=>{
    const used=(kit:SfxKit)=>recent.reduce((sum,item,age)=>sum+(item?.sfxKit===kit?6-age:0),0);
    return used(a)-used(b)||((seedOf(`${fixtureSeed}:${channel}:${a}`)+rank)%7)-((seedOf(`${fixtureSeed}:${channel}:${b}`)+rank)%7);
  });
  // Shorts stays restrained: never the cinematic kit with its crowd rise under an informational open.
  const sfxKit=channel==='YOUTUBE_SHORTS'?kits.find(kit=>kit!=='CINEMATIC')!:kits[0]!;
  return {version:AUDIO_LIBRARY_VERSION,music,ambience,sfxKit};
}

export interface SfxPlacement {id:SfxId;atSeconds:number;gainDb:number;}
/** Effects on the timeline: one opening accent, one cue per transition that has one, one closing accent. */
export function placeEffects(channel:GrowthVideoChannel,kit:SfxKit,transitions:readonly TransitionPlan[],transitionOffsets:readonly number[],totalSeconds:number,ctaStartSeconds:number):SfxPlacement[]{
  const cues=KIT_CUES[kit],base=MIX.sfxDb[channel],placements:SfxPlacement[]=[];
  placements.push({id:cues.open,atSeconds:channel==='INSTAGRAM_REELS'?.15:0,gainDb:base-(cues.open==='STADIUM_RISE'?4:0)});
  transitions.forEach((transition,index)=>{
    if(transition.cue==='NONE')return;
    const id=cues[transition.cue],lead=id==='WHOOSH'||id==='TRANSITION_SWEEP'?.18:0;
    placements.push({id,atSeconds:Math.max(0,transitionOffsets[index]!-lead),gainDb:base-(channel==='YOUTUBE_SHORTS'&&id!=='LIGHT_HIT'?3:0)});
  });
  if(ctaStartSeconds<totalSeconds-1)placements.push({id:cues.close,atSeconds:ctaStartSeconds+.1,gainDb:base-3});
  return placements;
}

export interface AudioProvenance {id:string;file:string;sha256:string;origin:'ORIGINAL_PROCEDURAL';license:string;commercialUse:true;}
