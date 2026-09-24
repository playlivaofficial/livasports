import type {AtmosphereKind,LayerEntrance,MotionPlan,SceneMotion,TimedScene} from './motion';

/**
 * Turns a motion plan plus rasterised scene layers into one FFmpeg filter graph.
 *
 * Every layer is a PNG decoded exactly once and repeated in memory by `loop`; all motion is overlay
 * position, a single background scale, built-in `xfade` transitions and a small strip for the
 * progress fill. Nothing is evaluated per pixel, which is what keeps a 1080×1920 film inside the
 * serverless render budget. Pure: no I/O, so the graph is unit-testable and reproducible.
 */

export interface PlacedLayer {path:string;x:number;y:number;width:number;height:number;}
export interface PreparedScene {
  order:number;
  /** Background rasterised at BLEED × the canvas so the camera can push and pan without edges. */
  background:string;
  left:PlacedLayer|null;right:PlacedLayer|null;
  /** Hero pieces that enter one after another (odds columns, list rows, CTA steps, versus mark). */
  center:PlacedLayer[];
  /** The scene headline: readable copy, but beneath the heroes exactly as the static composition layers it. */
  headline:PlacedLayer|null;
  foreground:PlacedLayer|null;
}
export interface SharedLayers {
  /** Brand lockup, platform label, rules and the progress track: static pieces above every cut. */
  chrome:PlacedLayer[];
  progressFill:string;
  atmosphere:Partial<Record<AtmosphereKind|'CROWD_SHIMMER_B',PlacedLayer>>;
}
export interface MotionGraphInput {
  width:number;height:number;fps:number;bleed:number;
  plan:MotionPlan;timeline:TimedScene[];totalSeconds:number;
  scenes:PreparedScene[];shared:SharedLayers;
  progress:{x:number;y:number;width:number;height:number};
}

const f=(value:number)=>Number.isFinite(value)?Number(value.toFixed(4)).toString():'0';
/** easeOutCubic remaining distance, 1 → 0 across the entrance window. */
const remaining=(delay:number,seconds:number)=>`pow(1-clip((t-${f(delay)})/${f(Math.max(.01,seconds))},0,1),3)`;
/** easeInQuad progress across the final `seconds` of a scene of length `duration`. */
const exiting=(duration:number,seconds:number)=>seconds>0?`pow(clip((t-${f(duration-seconds)})/${f(seconds)},0,1),2)`:'0';

export function buildMotionGraph(input:MotionGraphInput):{inputs:string[][];filter:string;videoLabel:string;transitionOffsets:number[]}{
  const {width:W,height:H,fps,plan,timeline,scenes,shared}=input;
  const inputs:string[][]=[],filters:string[]=[];
  const addInput=(path:string)=>{inputs.push(['-framerate',String(fps),'-i',path]);return inputs.length-1;};
  /** A still image looped into `frames` frames at the target rate — decoded once, repeated in memory. */
  const still=(path:string,frames:number,format:'yuv420p'|'yuva420p',label:string)=>{
    const index=addInput(path);
    filters.push(`[${index}:v]format=${format},loop=loop=${Math.max(0,frames-1)}:size=1:start=0,setpts=N/(${fps}*TB),fps=${fps}[${label}]`);
    return label;
  };
  let uid=0;const next=(prefix:string)=>`${prefix}${uid++}`;

  const overlayLayer=(base:string,layer:PlacedLayer,frames:number,entrance:LayerEntrance|null,motion:{driftX:number;driftY:number;exitX:number;exitSeconds:number;duration:number},extra='')=>{
    const src=still(layer.path,frames,'yuva420p',next('l'));
    let stream=src;
    if(entrance&&entrance.fade>0){const faded=next('f');filters.push(`[${src}]fade=t=in:st=${f(entrance.delay)}:d=${f(entrance.fade)}:alpha=1[${faded}]`);stream=faded;}
    const x=`${f(layer.x)}${entrance?`+${f(entrance.dx)}*${remaining(entrance.delay,entrance.seconds)}`:''}+${f(motion.driftX)}*t/${f(motion.duration)}+${f(motion.exitX)}*${exiting(motion.duration,motion.exitSeconds)}`;
    const y=`${f(layer.y)}${entrance?`+${f(entrance.dy)}*${remaining(entrance.delay,entrance.seconds)}`:''}+${f(motion.driftY)}*t/${f(motion.duration)}`;
    const out=next('o');
    filters.push(`[${base}][${stream}]overlay=x='${x}':y='${y}':format=yuv420${extra}[${out}]`);
    return out;
  };

  const sceneLabels:string[]=[];
  scenes.forEach((scene,index)=>{
    const time=timeline[index]!,motion:SceneMotion=plan.scenes[index]!,duration=time.durationSeconds,frames=Math.round(duration*fps);
    // Camera: slow push with an optional punch-in that settles, plus a lateral drift and the exit whip.
    const cam=motion.camera,bw=Math.round(W*input.bleed);
    const zoom=`(${f(cam.fromScale)}+${f(cam.toScale-cam.fromScale)}*t/${f(duration)}+${f(cam.punch)}*${remaining(0,cam.punchSeconds)})`;
    const exitX=motion.exit.dx*.35;
    const bg=still(scene.background,frames,'yuv420p',next('b'));
    const cammed=next('c');
    filters.push(`[${bg}]scale=w='2*trunc(${bw}*${zoom}/2)':h=-2:eval=frame:flags=fast_bilinear,`+
      `crop=${W}:${H}:x='clip((iw-${W})/2+${f(cam.panX)}*(t/${f(duration)}-0.5)+${f(exitX)}*${exiting(duration,motion.exit.seconds)},0,iw-${W})':`+
      `y='clip((ih-${H})/2+${f(cam.panY)}*(t/${f(duration)}-0.5),0,ih-${H})',setsar=1[${cammed}]`);
    let stream=cammed;
    // Atmosphere: slow, low-alpha movement behind the heroes; never over the readable foreground.
    for(const kind of motion.atmosphere){
      const layer=shared.atmosphere[kind];if(!layer)continue;
      const travel=kind==='LIGHT_SWEEP'?{driftX:W+layer.width*1.2,driftY:0}:kind==='HAZE'?{driftX:90,driftY:-24}:kind==='TUNNEL_GLOW'?{driftX:0,driftY:-60}
        :kind==='EDITORIAL_LINES'?{driftX:-72,driftY:36}:kind==='PITCH_GLIDE'?{driftX:0,driftY:48}:{driftX:0,driftY:0};
      if(kind==='CROWD_SHIMMER'){
        // Two sparse flash layers alternate, reading as phone lights and camera flashes in the stands.
        stream=overlayLayer(stream,layer,frames,null,{...travel,exitX:0,exitSeconds:0,duration},`:enable='lt(mod(t,0.66),0.33)'`);
        const b=shared.atmosphere.CROWD_SHIMMER_B;if(b)stream=overlayLayer(stream,b,frames,null,{...travel,exitX:0,exitSeconds:0,duration},`:enable='gte(mod(t,0.66),0.33)'`);
        continue;
      }
      stream=overlayLayer(stream,kind==='LIGHT_SWEEP'?{...layer,x:-layer.width*1.1}:layer,frames,null,{...travel,exitX:0,exitSeconds:0,duration});
    }
    const anchored={driftX:0,driftY:0,exitX:motion.exit.dx*.5,exitSeconds:motion.exit.seconds,duration};
    if(scene.headline)stream=overlayLayer(stream,scene.headline,frames,motion.foreground,anchored);
    const hero={driftX:motion.heroDrift.dx,driftY:motion.heroDrift.dy,exitX:motion.exit.dx,exitSeconds:motion.exit.seconds,duration};
    // Matchup push: left and right heroes travel toward each other, drifting opposite to the camera.
    if(scene.left)stream=overlayLayer(stream,scene.left,frames,motion.left,{...hero,driftX:hero.driftX+6});
    if(scene.right)stream=overlayLayer(stream,scene.right,frames,motion.right,{...hero,driftX:hero.driftX-6});
    scene.center.forEach((layer,piece)=>{
      const stagger=plan.grammar==='PUNCH'?.07:plan.grammar==='EDITORIAL_FLOW'?.12:.05;
      stream=overlayLayer(stream,layer,frames,{...motion.center,delay:motion.center.delay+piece*stagger},hero);
    });
    // Copy is anchored: it enters once, quickly, and then holds still so it can be read.
    if(scene.foreground)stream=overlayLayer(stream,scene.foreground,frames,motion.foreground,anchored);
    const done=next('s');filters.push(`[${stream}]format=yuv420p[${done}]`);sceneLabels.push(done);
  });

  // Transitions on the overlapping timeline; offsets are where the next scene begins.
  // xfade touches every frame it is given, so it only ever sees the overlap itself: each scene is cut
  // into head / body / tail on exact frame boundaries, the tail and the next head are cross-faded, and
  // the pieces are concatenated. Chaining xfade over whole scenes cost ~4.5 ms on every frame of the film.
  const transitionOffsets=plan.transitions.map((_,index)=>timeline[index+1]!.startSeconds);
  const frameCount=(seconds:number)=>Math.round(seconds*fps);
  const pieces:string[]=[];let pendingHead:string|null=null;
  sceneLabels.forEach((label,index)=>{
    const total=frameCount(timeline[index]!.durationSeconds),incoming=index?frameCount(plan.transitions[index-1]!.duration):0,outgoing=index<plan.transitions.length?frameCount(plan.transitions[index]!.duration):0;
    const parts=[incoming?'head':null,'body',outgoing?'tail':null].filter(Boolean) as string[];
    const labels=Object.fromEntries(parts.map(part=>[part,next(part[0]!)])) as Record<string,string>;
    // `segment` routes every frame to exactly one output, in order — no duplicated or buffered scenes.
    const bounds=[incoming||null,outgoing?total-outgoing:null].filter((value):value is number=>value!==null);
    filters.push(bounds.length?`[${label}]segment=frames=${bounds.join('|')}${parts.map(part=>`[${labels[part]}_]`).join('')}`:`[${label}]null[${labels.body}_]`);
    for(const part of parts)filters.push(`[${labels[part]}_]setpts=PTS-STARTPTS,fps=${fps}[${labels[part]}]`);
    if(incoming&&pendingHead){
      const transition=plan.transitions[index-1]!,mixed=next('x');
      filters.push(`[${pendingHead}][${labels.head}]xfade=transition=${transition.xfade}:duration=${f(incoming/fps)}:offset=0[${mixed}]`);
      let segment=mixed;
      // Graphics that ride the wipe edge. xfade's left-moving edges travel from x=W to x=0 over the overlap.
      // Drawn by an in-graph source rather than a file input: a late-read input made FFmpeg queue
      // ~45 full frames per transition while it waited (measured +140 MB each).
      if(transition.overlay){
        const band=transition.overlay==='LIGHT_BAND'
          ?{width:240,colors:['0xe9fff600','0xe9fff670','0xffffffd0','0xe9fff670','0xe9fff600']}
          :{width:44,colors:['0x00000000','0x00000050','0xf4fff9f0','0x00000050','0x00000000']};
        const src=next('t'),out=next('o'),seconds=f(incoming/fps);
        filters.push(`gradients=s=${band.width}x${H}:r=${fps}:d=${seconds}:nb_colors=${band.colors.length}:${band.colors.map((color,i)=>`c${i}=${color}`).join(':')}:x0=0:y0=0:x1=${band.width-1}:y1=0:speed=0,format=yuva420p[${src}]`);
        filters.push(`[${segment}][${src}]overlay=x='${f(W)}*(1-t/${seconds})-${f(band.width/2)}':y=0:format=yuv420[${out}]`);
        segment=out;
      }
      pieces.push(segment);
    }
    pieces.push(labels.body!);
    pendingHead=outgoing?labels.tail!:null;
  });
  const chain=next('j');
  filters.push(`${pieces.map(piece=>`[${piece}]`).join('')}concat=n=${pieces.length}:v=1:a=0[${chain}]`);
  // Persistent chrome sits above every transition, so the brand and the progress never cut.
  const frames=Math.round(input.totalSeconds*fps);
  let branded=chain;
  for(const piece of shared.chrome){
    const src=still(piece.path,1,'yuva420p',next('k')),out=next('o');
    // A single-frame input: overlay's default eof_action=repeat holds it for the whole film.
    filters.push(`[${branded}][${src}]overlay=x=${f(piece.x)}:y=${f(piece.y)}:format=yuv420[${out}]`);
    branded=out;
  }
  // Continuous progress fill: slid under a fixed crop of the track so it grows smoothly across cuts.
  const p=input.progress,fill=still(shared.progressFill,frames,'yuva420p',next('p')),split=[next('m'),next('m')],strip=next('r'),grown=next('g'),withProgress=next('o');
  filters.push(`[${branded}]split=2[${split[0]}][${split[1]}]`);
  filters.push(`[${split[1]}]crop=${p.width}:${p.height}:${p.x}:${p.y}[${strip}]`);
  filters.push(`[${strip}][${fill}]overlay=x='-${p.width}+${p.width}*t/${f(input.totalSeconds)}':y=0:format=yuv420[${grown}]`);
  filters.push(`[${split[0]}][${grown}]overlay=x=${p.x}:y=${p.y}:format=yuv420[${withProgress}]`);
  let video=withProgress;
  if(plan.opening.fadeFromBlack>0){const faded=next('o');filters.push(`[${video}]fade=t=in:st=0:d=${f(plan.opening.fadeFromBlack)}[${faded}]`);video=faded;}
  const final=next('v');filters.push(`[${video}]format=yuv420p[${final}]`);
  return {inputs,filter:filters.join(';'),videoLabel:final,transitionOffsets};
}
