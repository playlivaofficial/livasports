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
