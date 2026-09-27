import type {GrowthVideoChannel} from './config';
import type {SceneryFamily} from './scenery';
import type {GrowthVideoScene} from './types';

/**
 * Premium Motion V1 — one football motion language, three platform dialects.
 *
 * The Premium Creative renderer drew each scene as one flat picture and nudged it with a zoompan, so
 * five scenes read as five slides. This module plans motion instead of pictures: every scene is split
 * into depth layers (background camera, atmosphere, left/right/centre hero elements, readable
 * foreground) and every scene boundary is a transition family with its own timing and sound cue.
 *
 * Everything here is pure data derived deterministically from the fixture, the channel and the
 * scene plan the draft already carries — no randomness, so the same draft always renders the same
 * film, and the renderer only turns the plan into FFmpeg expressions.
 *
 * Budget rule: every effect must be expressible as a per-frame position/scale change of a layer that
 * was rasterised once, or as a built-in FFmpeg transition. Per-pixel expressions are banned: measured
 * at ~0.3 s per 1080×1920 frame, a single custom transition cost more than the whole camera system.
 */

export const TRANSITION_FAMILIES=['MATCH_CUT','WHIP','ZOOM_THROUGH','LIGHT_SWEEP','PITCH_LINE_WIPE','CROSS_DISSOLVE','PARALLAX'] as const;
export type TransitionFamily=typeof TRANSITION_FAMILIES[number];
export type TransitionCue='IMPACT'|'WHOOSH'|'LIGHT_HIT'|'SWEEP'|'NONE';

export interface TransitionPlan {
  family:TransitionFamily;
  /** Built-in FFmpeg xfade transition; never `custom`. */
  xfade:string;
  /** Overlap between the two scenes, seconds. */
  duration:number;
  /** Graphic laid over the cut in sync with the wipe edge. */
  overlay:'LIGHT_BAND'|'PITCH_LINE'|null;
  /** Direction of travel, used for the outgoing scene's exit drift and the sound's stereo motion. */
  direction:'LEFT'|'RIGHT'|'UP'|'NONE';
  /** Outgoing scene accelerates its layers into the cut so the motion carries across it (px). */
  exitDrift:number;
  /** Incoming scene camera starts this much tighter and settles (match-cut punch / zoom-through). */
  entryPunch:number;
  cue:TransitionCue;
}

export interface LayerEntrance {dx:number;dy:number;seconds:number;delay:number;fade:number;}
export interface SceneMotion {
  order:number;
  camera:{fromScale:number;toScale:number;panX:number;panY:number;punch:number;punchSeconds:number};
  /** Hero elements. Left and right travel toward the centre — the matchup push. */
  left:LayerEntrance;right:LayerEntrance;center:LayerEntrance;
  /** Continuous drift after the entrance, px over the scene; opposite to the camera pan for parallax. */
  heroDrift:{dx:number;dy:number};
  foreground:LayerEntrance;
  atmosphere:AtmosphereKind[];
  exit:{dx:number;dy:number;seconds:number};
}
export type AtmosphereKind='LIGHT_SWEEP'|'HAZE'|'CROWD_SHIMMER'|'TUNNEL_GLOW'|'EDITORIAL_LINES'|'PITCH_GLIDE';

export interface MotionPlan {
  channel:GrowthVideoChannel;
  grammar:'PUNCH'|'EDITORIAL_FLOW'|'INFORMATIONAL';
  /** Opening treatment of the very first frame. */
  opening:{fadeFromBlack:number;hookPunch:number};
  scenes:SceneMotion[];
  /** transitions[i] joins scene i and scene i+1. */
  transitions:TransitionPlan[];
}

const TRANSITIONS:Record<TransitionFamily,Omit<TransitionPlan,'duration'>&{duration:Record<GrowthVideoChannel,number>}>={
  // A hard cut disguised by a two-frame flash and a punch-in on the incoming shot: the cut lands on motion.
  MATCH_CUT:{family:'MATCH_CUT',xfade:'fadefast',duration:{TIKTOK:.12,INSTAGRAM_REELS:.16,YOUTUBE_SHORTS:.14},overlay:null,direction:'NONE',exitDrift:0,entryPunch:.07,cue:'IMPACT'},
  // Whip pan: the outgoing scene accelerates sideways into a short slide, as a broadcast camera would.
  WHIP:{family:'WHIP',xfade:'slideleft',duration:{TIKTOK:.24,INSTAGRAM_REELS:.3,YOUTUBE_SHORTS:.28},overlay:null,direction:'LEFT',exitDrift:-140,entryPunch:.02,cue:'WHOOSH'},
  // Through the frame: the camera pushes into the outgoing scene and the next one opens from its centre.
  ZOOM_THROUGH:{family:'ZOOM_THROUGH',xfade:'zoomin',duration:{TIKTOK:.28,INSTAGRAM_REELS:.36,YOUTUBE_SHORTS:.32},overlay:null,direction:'NONE',exitDrift:0,entryPunch:.05,cue:'WHOOSH'},
  // A floodlight band travels with the wipe edge, so the reveal reads as light rather than a page turn.
  LIGHT_SWEEP:{family:'LIGHT_SWEEP',xfade:'smoothleft',duration:{TIKTOK:.32,INSTAGRAM_REELS:.46,YOUTUBE_SHORTS:.4},overlay:'LIGHT_BAND',direction:'LEFT',exitDrift:-40,entryPunch:0,cue:'LIGHT_HIT'},
  // A painted touchline travels the wipe edge: the next scene is revealed behind a pitch line.
  PITCH_LINE_WIPE:{family:'PITCH_LINE_WIPE',xfade:'wipeleft',duration:{TIKTOK:.26,INSTAGRAM_REELS:.38,YOUTUBE_SHORTS:.34},overlay:'PITCH_LINE',direction:'LEFT',exitDrift:0,entryPunch:0,cue:'SWEEP'},
  CROSS_DISSOLVE:{family:'CROSS_DISSOLVE',xfade:'fade',duration:{TIKTOK:.22,INSTAGRAM_REELS:.5,YOUTUBE_SHORTS:.3},overlay:null,direction:'NONE',exitDrift:0,entryPunch:0,cue:'NONE'},
  // The incoming scene covers the outgoing one while the outgoing layers drift slower: depth, not a slide.
  PARALLAX:{family:'PARALLAX',xfade:'coverleft',duration:{TIKTOK:.28,INSTAGRAM_REELS:.44,YOUTUBE_SHORTS:.36},overlay:null,direction:'LEFT',exitDrift:-90,entryPunch:0,cue:'SWEEP'},
};

/**
 * Platform dialects. The pools are ordered by the scene plan's own transition hint, so the draft's
 * CUT/FADE/SLIDE intent (persisted since V1.1) still decides the character of each boundary.
 */
const GRAMMAR:Record<GrowthVideoChannel,{grammar:MotionPlan['grammar'];pools:Record<GrowthVideoScene['transition'],readonly TransitionFamily[]>}>={
  TIKTOK:{grammar:'PUNCH',pools:{CUT:['MATCH_CUT','ZOOM_THROUGH'],SLIDE:['WHIP','PARALLAX'],FADE:['ZOOM_THROUGH','MATCH_CUT']}},
  INSTAGRAM_REELS:{grammar:'EDITORIAL_FLOW',pools:{CUT:['PARALLAX','LIGHT_SWEEP'],SLIDE:['PARALLAX','LIGHT_SWEEP'],FADE:['CROSS_DISSOLVE','LIGHT_SWEEP']}},
  YOUTUBE_SHORTS:{grammar:'INFORMATIONAL',pools:{CUT:['PITCH_LINE_WIPE','MATCH_CUT'],SLIDE:['PITCH_LINE_WIPE','CROSS_DISSOLVE'],FADE:['CROSS_DISSOLVE','PITCH_LINE_WIPE']}},
};

const seedOf=(value:string)=>{let hash=2166136261;for(let index=0;index<value.length;index++)hash=Math.imul(hash^value.charCodeAt(index),16777619);return hash>>>0;};

/** Background-appropriate atmosphere. Never more than two moving elements behind readable copy. */
export function atmosphereFor(family:SceneryFamily|string,channel:GrowthVideoChannel):AtmosphereKind[]{
  const base:AtmosphereKind[]=family==='STADIUM_NIGHT'?['LIGHT_SWEEP','HAZE']:family==='TUNNEL_BIGMATCH'?['TUNNEL_GLOW','HAZE']
    :family==='PITCH_MATCHDAY'?['PITCH_GLIDE','CROWD_SHIMMER']:family==='EDITORIAL_SPORTS'?['EDITORIAL_LINES']
      :family==='CHARACTER_WORLD'?['LIGHT_SWEEP','CROWD_SHIMMER']:['CROWD_SHIMMER','HAZE'];
  // Shorts favours readability: a single, slow atmosphere element.
  return channel==='YOUTUBE_SHORTS'?base.slice(0,1):base;
}

/**
 * The deterministic motion plan for one platform draft. `sceneryFamilies` are the per-scene background
 * families the renderer resolved (stored creative choices first, deterministic fallback second).
 */
export function planMotion(channel:GrowthVideoChannel,scenes:readonly Pick<GrowthVideoScene,'order'|'transition'|'visual'>[],
  seed:string,sceneryFamilies:readonly string[]):MotionPlan{
  const dialect=GRAMMAR[channel],base=seedOf(`${seed}:${channel}:motion`);
  const transitions:TransitionPlan[]=[];
  let previous:TransitionFamily|null=null;
  for(let index=0;index<scenes.length-1;index++){
    // The transition INTO scene i+1 follows that scene's own hint (a scene "enters" with its transition).
    const pool=dialect.pools[scenes[index+1]!.transition]??dialect.pools.CUT;
    let family=pool[(base+index)%pool.length]!;
    // Never the same family twice in a row: repetition is what makes a template read as a template.
    if(family===previous)family=pool.find(candidate=>candidate!==previous)??family;
    previous=family;
    const spec=TRANSITIONS[family];
    transitions.push({...spec,duration:spec.duration[channel]});
  }
  const flip=(index:number)=>((base>>(index%16))&1)?1:-1;
  const sceneMotion=scenes.map((scene,index):SceneMotion=>{
    const incoming=index?transitions[index-1]!:null,outgoing=transitions[index]??null,direction=flip(index);
    const hook=scene.visual==='HOOK',cta=scene.visual==='CTA';
    const punch=incoming?.entryPunch??0;
    if(channel==='TIKTOK')return {order:scene.order,
      camera:{fromScale:1,toScale:hook?1.075:1.06,panX:direction*26,panY:-14,punch:hook?.1:punch,punchSeconds:hook?.34:.24},
      left:{dx:-150,dy:0,seconds:.26,delay:.02,fade:.12},right:{dx:150,dy:0,seconds:.26,delay:.06,fade:.12},center:{dx:0,dy:70,seconds:.24,delay:.08,fade:.1},
      heroDrift:{dx:-direction*14,dy:-6},foreground:{dx:0,dy:34,seconds:.2,delay:hook?0:.04,fade:.12},
      atmosphere:atmosphereFor(sceneryFamilies[index]??'',channel),
      exit:{dx:outgoing?.exitDrift??0,dy:0,seconds:outgoing?.duration??0}};
    if(channel==='INSTAGRAM_REELS')return {order:scene.order,
      camera:{fromScale:1,toScale:cta?1.03:1.045,panX:direction*34,panY:-10,punch:punch*.6,punchSeconds:.4},
      left:{dx:-90,dy:18,seconds:.62,delay:.08,fade:.36},right:{dx:90,dy:18,seconds:.62,delay:.16,fade:.36},center:{dx:0,dy:40,seconds:.55,delay:.14,fade:.4},
      heroDrift:{dx:-direction*18,dy:-8},foreground:{dx:0,dy:26,seconds:.5,delay:.12,fade:.38},
      atmosphere:atmosphereFor(sceneryFamilies[index]??'',channel),
      exit:{dx:outgoing?.exitDrift??0,dy:0,seconds:outgoing?.duration??0}};
    // Shorts: controlled camera, text on screen from the first frame of the scene.
    return {order:scene.order,
      camera:{fromScale:1,toScale:1.025,panX:0,panY:-10,punch:punch*.5,punchSeconds:.22},
      left:{dx:-60,dy:0,seconds:.32,delay:0,fade:.16},right:{dx:60,dy:0,seconds:.32,delay:.04,fade:.16},center:{dx:0,dy:24,seconds:.3,delay:.04,fade:.16},
      heroDrift:{dx:0,dy:-6},foreground:{dx:0,dy:0,seconds:.12,delay:0,fade:.1},
      atmosphere:atmosphereFor(sceneryFamilies[index]??'',channel),
      exit:{dx:outgoing?.exitDrift??0,dy:0,seconds:outgoing?.duration??0}};
  });
  return {channel,grammar:dialect.grammar,
    opening:channel==='INSTAGRAM_REELS'?{fadeFromBlack:.3,hookPunch:0}:channel==='TIKTOK'?{fadeFromBlack:0,hookPunch:.1}:{fadeFromBlack:0,hookPunch:0},
    scenes:sceneMotion,transitions};
}

/** Transitions snap to whole frames (at least two) so every cut, trim and overlap lands on a frame. */
export function alignTransitions(plan:MotionPlan,fps:number):MotionPlan{
  return {...plan,transitions:plan.transitions.map(transition=>({...transition,duration:Math.max(2,Math.round(transition.duration*fps))/fps}))};
}

/** Stable master: no continuous camera resampling, pan, drift or moving readable copy.
 * Only a short opacity entrance and restrained dissolve/wipe remain. */
export function planMasterMotion(scenes:readonly Pick<GrowthVideoScene,'order'|'transition'|'visual'>[],seed:string,families:readonly string[]):MotionPlan{
  const base=planMotion('INSTAGRAM_REELS',scenes,seed,families);
  const settle={dx:0,dy:0,seconds:.25,delay:0,fade:.25};
  return {...base,opening:{fadeFromBlack:0,hookPunch:0},transitions:base.transitions.map((_,index)=>({
    ...TRANSITIONS[index%2?'PITCH_LINE_WIPE':'CROSS_DISSOLVE'],duration:.28,exitDrift:0,entryPunch:0,overlay:null})),
    scenes:base.scenes.map((scene,index)=>({...scene,camera:{fromScale:1,toScale:1,panX:0,panY:0,punch:0,punchSeconds:0},
      left:index?settle:{...settle,fade:0},right:index?settle:{...settle,fade:0},center:settle,
      foreground:{...settle,fade:0},heroDrift:{dx:0,dy:0},exit:{dx:0,dy:0,seconds:0},
      atmosphere:scenes[index].visual==='HOOK'?['LIGHT_SWEEP']:[]}))};
}

/**
 * Scene timing on an overlapping timeline. A transition of length T overlaps the last T seconds of
 * one scene with the first T seconds of the next, so scene k starts at the sum of the previous scene
 * durations minus the previous overlaps. Narration for a scene is placed inside its clean window:
 * after the incoming transition has half-resolved and ending before the outgoing one begins, so a
 * voice can never be heard over the wrong picture.
 */
export interface TimedScene {order:number;startSeconds:number;durationSeconds:number;audioSeconds:number;voiceStartSeconds:number;voiceEndLimitSeconds:number;}
export function sceneTimeline(scenes:readonly {order:number;durationSeconds:number}[],transitions:readonly TransitionPlan[],audioSeconds:ReadonlyMap<number,number>,
  options:{fps:number;lead:number;tail:number}):{scenes:TimedScene[];totalSeconds:number}{
  const frame=(value:number)=>Math.ceil(value*options.fps-1e-6)/options.fps;
  let cursor=0;const timed:TimedScene[]=[];
  scenes.forEach((scene,index)=>{
    const incoming=index?transitions[index-1]!.duration:0,outgoing=transitions[index]?.duration??0,audio=audioSeconds.get(scene.order)??0;
    // Voice starts once the incoming transition is half-way and must finish, plus a breath, before the outgoing one starts.
    const voiceOffset=incoming*.5+options.lead;
    const needed=audio?voiceOffset+audio+options.tail+outgoing:0;
    const durationSeconds=frame(Math.max(scene.durationSeconds,needed));
    timed.push({order:scene.order,startSeconds:cursor,durationSeconds,audioSeconds:audio,voiceStartSeconds:cursor+voiceOffset,voiceEndLimitSeconds:cursor+durationSeconds-outgoing});
    cursor+=durationSeconds-outgoing;
  });
  const last=timed.at(-1);
  return {scenes:timed,totalSeconds:last?last.startSeconds+last.durationSeconds:0};
}
