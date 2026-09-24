import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {ElevenLabsVoiceProvider,narrateScenes,UnavailableVoiceProvider} from './voice';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('premium narration boundary',()=>{
  it('uses a configured PT-BR voice directly without listing the voice library',async()=>{
    vi.stubEnv('ELEVENLABS_API_KEY','unit-test-only');vi.stubEnv('ELEVENLABS_VOICE_ENERGETIC','approved-br-voice');
    const fetcher=vi.fn(async()=>new Response(new Uint8Array([1,2,3]),{status:200}));vi.stubGlobal('fetch',fetcher);
    const result=await new ElevenLabsVoiceProvider().synthesize('Compare as odds no LivaSports.com.','ENERGETIC');
    expect(result.data.length).toBe(3);expect(fetcher).toHaveBeenCalledTimes(1);
    const call=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(call[0]).toContain('/text-to-speech/approved-br-voice');
    expect(JSON.parse(String(call[1].body))).toMatchObject({language_code:'pt',model_id:'eleven_multilingual_v2'});
  });
  it('redacts provider error bodies and marks unconfigured narration explicitly',async()=>{
    vi.stubEnv('ELEVENLABS_API_KEY','unit-test-only');vi.stubGlobal('fetch',vi.fn(async()=>new Response('private provider diagnostic',{status:429})));
    await expect(new ElevenLabsVoiceProvider().synthesize('Texto.','EDITORIAL')).rejects.toThrow('VOICE_HTTP_429');
    const result=await narrateScenes([{order:1,startSeconds:0,text:'Texto.'}],'EDITORIAL',{provider:new UnavailableVoiceProvider()});
    expect(result.degradedReason).toBe('VOICE_NOT_CONFIGURED');expect(result.clips).toEqual([]);
  });
  it('never starts synthesis after the shared invocation deadline',async()=>{
    const synthesize=vi.fn();const result=await narrateScenes([{order:1,startSeconds:0,text:'Texto.'}],'ENERGETIC',
      {provider:{id:'test',available:()=>true,synthesize},now:()=>1000,deadlineMs:999});
    expect(synthesize).not.toHaveBeenCalled();expect(result.degradedReason).toBe('VOICE_BUDGET_EXCEEDED');
  });
});

describe('natural voice V1',()=>{
  const clip=(text:string)=>({mode:'EDITORIAL' as const,mimeType:'audio/mpeg' as const,data:Buffer.from(text),sha256:'b'.repeat(64)});
  const lines=[{order:1,startSeconds:0,text:'Brasileirão Série A · sáb. · 27/09, 16:00'},{order:2,startSeconds:4,text:'Na classificação: Flamengo, 3º. Palmeiras, 5º.'},{order:3,startSeconds:8,text:'Veja no LivaSports.com.'}];
  it('sends spoken Portuguese with neighbouring lines, mode speed and a stable seed',async()=>{
    vi.stubEnv('ELEVENLABS_API_KEY','unit-test-only');
    const fetcher=vi.fn(async()=>new Response(new Uint8Array([1]),{status:200}));vi.stubGlobal('fetch',fetcher);
    const result=await narrateScenes(lines,'EDITORIAL',{provider:new ElevenLabsVoiceProvider()});
    expect(result.degradedReason).toBeNull();
    const bodies=fetcher.mock.calls.map(call=>JSON.parse(String((call as unknown as [string,RequestInit])[1].body)));
    const middle=bodies.find(body=>body.text.includes('terceiro'))!;
    expect(middle.text).toBe('Na classificação. Flamengo, terceiro. Palmeiras, quinto.');
    expect(middle.previous_text).toContain('sábado, dia vinte e sete, às dezesseis horas');
    expect(middle.next_text).toBe('Veja no Liva Sports ponto com.');
    expect(middle.voice_settings).toMatchObject({speed:.97,stability:.56});
    expect(Number.isInteger(middle.seed)).toBe(true);
    // Keys never travel in bodies, and the key never appears in any request field.
    expect(JSON.stringify(bodies)).not.toContain('unit-test-only');
  });
  it('reuses durable clips so an unchanged line is never bought twice',async()=>{
    const stored=new Map<string,ReturnType<typeof clip>>();
    const store={get:vi.fn(async(key:string)=>stored.get(key)??null),put:vi.fn(async(key:string,value:ReturnType<typeof clip>)=>{stored.set(key,value);})};
    const synthesize=vi.fn(async(text:string)=>clip(text));
    const provider={id:'test',available:()=>true,synthesize,voiceFor:()=>'voice-a'};
    const first=await narrateScenes(lines,'EDITORIAL',{provider,store});
    expect(first.cache).toMatchObject({synthesized:3,storeHits:0});expect(store.put).toHaveBeenCalledTimes(3);
    const second=await narrateScenes(lines,'EDITORIAL',{provider,store});
    expect(synthesize).toHaveBeenCalledTimes(3);expect(second.cache).toMatchObject({synthesized:0,storeHits:3,characters:0});
    // A different voice is a different take: no false cache hit.
    const other=await narrateScenes(lines,'EDITORIAL',{provider:{...provider,voiceFor:()=>'voice-b'},store});
    expect(other.cache?.synthesized).toBe(3);
  });
  it('keeps rendering when the durable store fails',async()=>{
    const store={get:vi.fn(async()=>{throw new Error('db down');}),put:vi.fn(async()=>{throw new Error('db down');})};
    const provider={id:'test',available:()=>true,synthesize:vi.fn(async(text:string)=>clip(text))};
    const result=await narrateScenes(lines,'EDITORIAL',{provider,store});
    expect(result.degradedReason).toBeNull();expect(result.clips).toHaveLength(3);
  });
});
