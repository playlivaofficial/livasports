import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {alignTransitions,planMotion,sceneTimeline,TRANSITION_FAMILIES} from './motion';
import {buildMotionGraph} from './motion-graph';
import {AUDIO_FILES,placeEffects,selectAudioDirection} from './audio-design';
import {buildMixGraph,parseLoudnorm} from './audio-mix';

const scenes=[{order:1,transition:'CUT',visual:'HOOK'},{order:2,transition:'SLIDE',visual:'MATCHUP'},{order:3,transition:'CUT',visual:'CONTEXT'},{order:4,transition:'FADE',visual:'ODDS'},{order:5,transition:'CUT',visual:'CTA'}] as const;
const families=['STADIUM_NIGHT','TUNNEL_BIGMATCH','PITCH_MATCHDAY','EDITORIAL_SPORTS','STADIUM_NIGHT'];

describe('premium motion language',()=>{
  it('gives each platform its own grammar, deterministically',()=>{
    const plans=(['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const).map(channel=>planMotion(channel,[...scenes],'fixture-1',families));
    expect(new Set(plans.map(plan=>plan.grammar)).size).toBe(3);
    expect(new Set(plans.map(plan=>plan.transitions.map(t=>t.family).join())).size).toBe(3);
    expect(planMotion('TIKTOK',[...scenes],'fixture-1',families)).toEqual(plans[0]);
    // TikTok cuts fastest, Reels flows slowest; Shorts keeps copy on screen from the first frame.
    const mean=(index:number)=>plans[index]!.transitions.reduce((sum,t)=>sum+t.duration,0)/4;
    expect(mean(0)).toBeLessThan(mean(2));expect(mean(2)).toBeLessThan(mean(1));
    expect(plans[2]!.scenes.every(scene=>scene.foreground.dy===0&&scene.camera.panX===0)).toBe(true);
    for(const plan of plans){
      expect(plan.transitions.every(t=>TRANSITION_FAMILIES.includes(t.family)&&t.xfade!=='custom')).toBe(true);
      // Never the same family twice in a row.
      plan.transitions.forEach((t,index)=>{if(index)expect(t.family).not.toBe(plan.transitions[index-1]!.family);});
    }
  });
  it('varies across fixtures instead of repeating one template',()=>{
    const signatures=new Set(Array.from({length:12},(_,index)=>planMotion('TIKTOK',[...scenes],`fixture-${index}`,families).transitions.map(t=>t.family).join()));
    expect(signatures.size).toBeGreaterThan(1);
  });
  it('keeps narration inside each scene and frame-aligns the overlapping timeline',()=>{
    const plan=alignTransitions(planMotion('INSTAGRAM_REELS',[...scenes],'fixture-1',families),15);
    for(const t of plan.transitions)expect(Math.abs(t.duration*15-Math.round(t.duration*15))).toBeLessThan(1e-9);
    const audio=new Map([[1,3.2],[2,4.1],[3,5.8],[4,4.4],[5,3.9]]);
    const timeline=sceneTimeline(scenes.map(scene=>({order:scene.order,durationSeconds:3})),plan.transitions,audio,{fps:15,lead:.16,tail:.42});
    timeline.scenes.forEach((scene,index)=>{
      expect(scene.voiceStartSeconds+scene.audioSeconds+.42).toBeLessThanOrEqual(scene.voiceEndLimitSeconds+1e-6);
      if(index){
        const previous=timeline.scenes[index-1]!,incoming=plan.transitions[index-1]!.duration;
        // Lines never overlap, and a line only starts once its picture has won the transition.
        expect(scene.voiceStartSeconds).toBeGreaterThanOrEqual(previous.voiceStartSeconds+previous.audioSeconds);
        expect(scene.voiceStartSeconds).toBeGreaterThanOrEqual(scene.startSeconds+incoming/2);
      }
      expect(Math.abs(scene.durationSeconds*15-Math.round(scene.durationSeconds*15))).toBeLessThan(1e-6);
    });
    const last=timeline.scenes.at(-1)!;expect(timeline.totalSeconds).toBeCloseTo(last.startSeconds+last.durationSeconds);
  });
  it('builds a graph with no per-pixel expressions and xfade only on the overlaps',()=>{
    const plan=alignTransitions(planMotion('YOUTUBE_SHORTS',[...scenes],'f',families),15);
    const timeline=sceneTimeline(scenes.map(scene=>({order:scene.order,durationSeconds:4})),plan.transitions,new Map(),{fps:15,lead:.1,tail:.3});
    const layer=(name:string)=>({path:`${name}.png`,x:10,y:20,width:100,height:50});
    const graph=buildMotionGraph({width:1080,height:1920,fps:15,bleed:1.1,plan,timeline:timeline.scenes,totalSeconds:timeline.totalSeconds,
      scenes:scenes.map(scene=>({order:scene.order,background:`bg${scene.order}.png`,headline:layer('h'),left:layer('l'),right:layer('r'),center:[layer('c')],foreground:layer('f')})),
      shared:{chrome:[layer('k')],progressFill:'p.png',atmosphere:{LIGHT_SWEEP:layer('ls'),HAZE:layer('hz'),CROWD_SHIMMER:layer('cs'),CROWD_SHIMMER_B:layer('cb'),TUNNEL_GLOW:layer('tg'),EDITORIAL_LINES:layer('el'),PITCH_GLIDE:layer('pg')}},
      progress:{x:76,y:1830,width:928,height:10}});
    expect(graph.filter).not.toMatch(/geq|transition=custom/);
    expect((graph.filter.match(/xfade=/g)??[]).length).toBe(4);
    expect(graph.filter).toContain('segment=frames=');expect(graph.filter).toContain('concat=n=9');
    expect(graph.transitionOffsets).toEqual(timeline.scenes.slice(1).map(scene=>scene.startSeconds));
  });
});

describe('rights-safe sound design',()=>{
  it('ships every referenced file with a matching provenance hash and a commercial licence',async()=>{
    const root=join(process.cwd(),'public/growth/audio/v1');
    const provenance=JSON.parse(await readFile(join(root,'PROVENANCE.json'),'utf8')) as {items:Array<{file:string;sha256:string;origin:string;commercialUse:boolean}>};
    for(const file of Object.values(AUDIO_FILES)){
      const entry=provenance.items.find(item=>item.file===file)!;expect(entry).toBeTruthy();
      expect(entry.origin).toBe('ORIGINAL_PROCEDURAL');expect(entry.commercialUse).toBe(true);
      expect(createHash('sha256').update(await readFile(join(root,file))).digest('hex')).toBe(entry.sha256);
    }
  });
  it('selects audio deterministically and rotates away from recent beds',()=>{
    const base={channel:'TIKTOK' as const,angle:'DERBY_RIVALRY',fixtureSeed:'fx-1'};
    const first=selectAudioDirection(base);expect(selectAudioDirection(base)).toEqual(first);
    const next=selectAudioDirection({...base,recent:[first,first]});
    expect(next.music).not.toBe(first.music);expect(next.sfxKit).not.toBe(first.sfxKit);
    expect(selectAudioDirection({...base,channel:'YOUTUBE_SHORTS'}).sfxKit).not.toBe('CINEMATIC');
    const moods=new Set(['BIG_MATCH','ODDS_GAP','DERBY_RIVALRY','WEEKEND_WATCHLIST'].map(angle=>selectAudioDirection({...base,angle}).music));
    expect(moods.size).toBeGreaterThan(1);
    // A same-angle Top 5 (a derby-heavy weekend) still spreads across beds on every platform.
    for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const){
      const top5=new Set([1,2,3,4,5].map(rank=>selectAudioDirection({...base,channel,rank,fixtureSeed:`fx-${rank}`}).music));
      expect(top5.size).toBeGreaterThanOrEqual(3);
    }
  });
  it('places effects on transitions and keeps the mix voice-led',()=>{
    const plan=planMotion('TIKTOK',[...scenes],'f',families);
    const effects=placeEffects('TIKTOK','MATCHDAY',plan.transitions,[4,8,12,16],20,16);
    expect(effects.length).toBeGreaterThanOrEqual(2);expect(effects.every(effect=>effect.gainDb<0)).toBe(true);
    const mix=buildMixGraph({channel:'TIKTOK',totalSeconds:20,voice:[{path:'v.mp3',atSeconds:.1,seconds:3}],music:'m.m4a',ambience:'a.m4a',
      effects:effects.map(effect=>({...effect,path:'s.m4a'})),output:'o.wav'});
    const graph=mix.args[mix.args.indexOf('-filter_complex')+1]!;
    expect(graph).toContain('sidechaincompress');expect(graph).toMatch(/\[beds\]\[key\]sidechaincompress/);
    expect(graph).toContain('afade=t=in');expect(mix.stems).toEqual({voice:1,music:true,ambience:true,effects:effects.length});
    expect(parseLoudnorm('noise {\n"input_i" : "-20.1", "input_tp" : "-3.0", "input_lra" : "4.0", "input_thresh" : "-30.2", "target_offset" : "0.1"\n}')?.input_i).toBe('-20.1');
    expect(parseLoudnorm('{"input_i" : "-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-70","target_offset":"0"}')).toBeNull();
  });
});
