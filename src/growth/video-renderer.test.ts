import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {generateV11ContentPack,fixtureSnapshot} from './content';
import {rankedFixture} from './fixtures.test-support';
import {renderGrowthVideo,renderGrowthVideos} from './video-renderer';

describe('Traffic Engine V1.1 MP4 renderer',()=>{
  it('renders a deterministic multi-scene H.264-compatible MP4 without remote media',async()=>{
    const row=rankedFixture({home:{slug:'flamengo',name:'Clube de Regatas do Flamengo',publicId:'a'.repeat(16),imageUrl:null},away:{slug:'corinthians',name:'Sport Club Corinthians Paulista',publicId:'b'.repeat(16),imageUrl:null}});
    const draft=generateV11ContentPack(row,1,[row]).platforms!.TIKTOK;
    const rendered=await renderGrowthVideo(draft,fixtureSnapshot(row),{assetLoader:async()=>null});
    expect(rendered.mimeType).toBe('video/mp4');expect(rendered.byteLength).toBeGreaterThan(20_000);expect(rendered.byteLength).toBeLessThan(8_000_000);
    expect(rendered.data.subarray(4,8).toString()).toBe('ftyp');expect(rendered.sha256).toMatch(/^[a-f0-9]{64}$/);
    const repeated=await renderGrowthVideo(draft,fixtureSnapshot(row),{assetLoader:async()=>null});expect(repeated.sha256).toBe(rendered.sha256);
  },120_000);
  it('renders all platform outputs through the bounded-memory batch path',async()=>{
    const base=rankedFixture(),row=rankedFixture({home:{...base.signals.home,imageUrl:'https://cdn.sportmonks.com/football/teams/1.png'},away:{...base.signals.away,imageUrl:'https://cdn.sportmonks.com/football/teams/2.png'}}),pack=generateV11ContentPack(row,1,[row]);
    const loader=vi.fn(async()=>null),rendered=await renderGrowthVideos(pack.platforms!,fixtureSnapshot(row),{assetLoader:loader});
    expect(rendered).toHaveLength(3);expect(rendered.map(item=>item.channel)).toEqual(['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS']);
    expect(rendered.every(item=>item.status==='READY'&&item.byteLength>20_000)).toBe(true);
    expect(loader).toHaveBeenCalledTimes(2);
  },120_000);
});

describe('Traffic Engine V1.2 narration mux',()=>{
  /** A short generated tone stands in for a provider clip: rights-safe and produced by FFmpeg itself. */
  async function toneClip():Promise<Buffer>{
    const {spawn}=await import('node:child_process');
    const {mkdtemp,readFile,rm}=await import('node:fs/promises');
    const {tmpdir}=await import('node:os');const {join}=await import('node:path');
    const ffmpeg=(await import('ffmpeg-static')).default!;
    const dir=await mkdtemp(join(tmpdir(),'liva-voice-test-'));const out=join(dir,'tone.mp3');
    try{
      await new Promise<void>((resolve,reject)=>{
        const child=spawn(ffmpeg,['-f','lavfi','-i','sine=frequency=320:duration=1.1','-ac','1','-y',out],{windowsHide:true,stdio:['ignore','ignore','ignore']});
        child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`FFMPEG_${code}`)));
      });
      return await readFile(out);
    }finally{await rm(dir,{recursive:true,force:true});}
  }
  const stubVoice=(data:Buffer)=>({id:'stub',available:()=>true,
    synthesize:vi.fn(async(_text:string,mode:'ENERGETIC'|'EDITORIAL')=>({mode,mimeType:'audio/mpeg' as const,data,sha256:'a'.repeat(64)}))});

  it('lays narration against the scene plan and encodes a real audio track',async()=>{
    const row=rankedFixture(),draft=generateV11ContentPack(row,1,[row]).platforms!.TIKTOK;
    const voice=stubVoice(await toneClip());
    const rendered=await renderGrowthVideo(draft,fixtureSnapshot(row),{assetLoader:async()=>null,voice});
    expect(rendered.status).toBe('READY');
    expect(rendered.voice?.degradedReason).toBeNull();
    expect(rendered.voice?.lines).toBe(draft.scenes.filter(scene=>scene.voiceover.trim()).length);
    // TikTok narrates with the energetic voice; every scene line was requested.
    expect(rendered.voice?.mode).toBe('ENERGETIC');
    expect(voice.synthesize).toHaveBeenCalled();
    // An AAC track is present in the container, so the MP4 is genuinely voiced rather than silent.
    expect(rendered.data.includes(Buffer.from('mp4a'))).toBe(true);
    expect(rendered.byteLength).toBeLessThan(8_000_000);
  },180_000);

  it('still ships a captioned silent video when no credential is configured',async()=>{
    const row=rankedFixture(),draft=generateV11ContentPack(row,1,[row]).platforms!.YOUTUBE_SHORTS;
    const rendered=await renderGrowthVideo(draft,fixtureSnapshot(row),{assetLoader:async()=>null,
      voice:{id:'unavailable',available:()=>false,synthesize:async()=>{throw new Error('VOICE_NOT_CONFIGURED');}}});
    expect(rendered.status).toBe('READY');
    expect(rendered.voice?.degradedReason).toBe('VOICE_NOT_CONFIGURED');
    expect(rendered.voice?.lines).toBe(0);
    expect(rendered.data.includes(Buffer.from('mp4a'))).toBe(false);
    expect(rendered.byteLength).toBeGreaterThan(20_000);
  },180_000);

  it('reuses one synthesis across the three platform renders of a fixture',async()=>{
    const row=rankedFixture(),pack=generateV11ContentPack(row,1,[row]);
    const voice=stubVoice(await toneClip());
    const rendered=await renderGrowthVideos(pack.platforms!,fixtureSnapshot(row),{assetLoader:async()=>null,voice});
    expect(rendered).toHaveLength(3);
    expect(rendered.every(item=>item.status==='READY')).toBe(true);
    // Distinct lines only: the shared cache must collapse any line the platforms word identically.
    const requested=voice.synthesize.mock.calls.map(call=>`${call[1]}:${call[0]}`);
    expect(new Set(requested).size).toBe(requested.length);
  },240_000);
});
