import 'server-only';
import {createHash} from 'node:crypto';
import {VOICE,type GrowthVoiceMode} from './config';

/**
 * Traffic Engine V1.2 — Brazilian Portuguese narration.
 *
 * A provider boundary rather than a direct integration: the renderer asks for audio for a line of
 * script and never learns who produced it. ElevenLabs is the configured provider; an unconfigured
 * environment returns an explicitly unavailable provider so preview builds, CI and local runs keep
 * producing the same silent-but-captioned video instead of failing.
 *
 * The credential is read from `process.env.ELEVENLABS_API_KEY` at call time and is never logged,
 * returned, embedded in an asset, or written to the database.
 *
 * Runtime safety is a first-class concern here (V1.1 fought hard for its serverless budget): every
 * request is individually timed out, the whole video shares one synthesis budget, responses are size
 * bounded, and identical lines are synthesised once and reused across platforms.
 */

export interface VoiceClip {
  mode:GrowthVoiceMode;
  /** MP3 is what ElevenLabs returns and what FFmpeg muxes without a re-encode decision. */
  mimeType:'audio/mpeg';
  data:Buffer;
  sha256:string;
}
export interface VoiceProvider {
  readonly id:string;
  /** False when no credential is configured; callers degrade to a silent render, never an error. */
  available():boolean;
  synthesize(text:string,mode:GrowthVoiceMode,signal?:AbortSignal):Promise<VoiceClip>;
}

export class VoiceUnavailableError extends Error{
  constructor(readonly code:string){super(code);this.name='VoiceUnavailableError';}
}

const apiKey=()=>process.env.ELEVENLABS_API_KEY?.trim()||null;
/** Never interpolate the key itself anywhere; only its presence is ever observable. */
export const voiceConfigured=()=>!!apiKey();

/**
 * Which voice speaks each mode. Deliberately resolved without calling the provider: a scoped API key
 * can legitimately carry `text_to_speech` while withholding `voices_read`, and listing the library
 * would then 401 even though synthesis works perfectly. Pinned ids are overridable per mode so a
 * Brazilian voice from the account's own library can be swapped in without a code change.
 */
function voiceId(mode:GrowthVoiceMode):string{
  const override=(mode==='ENERGETIC'?process.env.ELEVENLABS_VOICE_ENERGETIC:process.env.ELEVENLABS_VOICE_EDITORIAL)?.trim();
  return override||VOICE.defaultVoices[mode];
}

export class ElevenLabsVoiceProvider implements VoiceProvider{
  readonly id='elevenlabs';
  available(){return voiceConfigured();}
  async synthesize(text:string,mode:GrowthVoiceMode,signal?:AbortSignal):Promise<VoiceClip>{
    const key=apiKey();
    if(!key)throw new VoiceUnavailableError('VOICE_NOT_CONFIGURED');
    const trimmed=text.trim();
    if(!trimmed)throw new VoiceUnavailableError('VOICE_EMPTY_TEXT');
    if(trimmed.length>VOICE.maxCharacters)throw new VoiceUnavailableError('VOICE_TEXT_TOO_LONG');
    const voice=voiceId(mode),settings=VOICE.modes[mode];
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),VOICE.requestTimeoutMs);
    const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    try{
      const response=await fetch(`${VOICE.baseUrl}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${VOICE.outputFormat}`,{
        method:'POST',signal:controller.signal,
        headers:{'xi-api-key':key,'content-type':'application/json',accept:'audio/mpeg'},
        body:JSON.stringify({text:trimmed,model_id:VOICE.model,language_code:VOICE.language,
          voice_settings:{stability:settings.stability,similarity_boost:settings.similarity,style:settings.style,use_speaker_boost:true}}),
      });
      // The body may carry the provider's own error text; only the status is ever surfaced onwards.
      if(!response.ok)throw new VoiceUnavailableError(`VOICE_HTTP_${response.status}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(!data.length)throw new VoiceUnavailableError('VOICE_EMPTY_AUDIO');
      if(data.length>VOICE.maxClipBytes)throw new VoiceUnavailableError('VOICE_CLIP_TOO_LARGE');
      return {mode,mimeType:'audio/mpeg',data,sha256:createHash('sha256').update(data).digest('hex')};
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
}

/** The explicit "no credential" provider. Keeps the silent path a deliberate state, not an exception. */
export class UnavailableVoiceProvider implements VoiceProvider{
  readonly id='unavailable';
  available(){return false;}
  async synthesize():Promise<VoiceClip>{throw new VoiceUnavailableError('VOICE_NOT_CONFIGURED');}
}

export function voiceProvider():VoiceProvider{
  return voiceConfigured()?new ElevenLabsVoiceProvider():new UnavailableVoiceProvider();
}

export interface NarrationLine {order:number;startSeconds:number;text:string;}
export interface NarrationClip extends NarrationLine {clip:VoiceClip;}
export interface NarrationResult {
  mode:GrowthVoiceMode;
  provider:string;
  clips:NarrationClip[];
  /** Why narration is absent or partial, for the owner queue. Null when every line was produced. */
  degradedReason:string|null;
}

/**
 * Narrate one platform draft. Lines are synthesised once per distinct text, in a small pool, under a
 * shared wall-clock budget; exceeding the budget degrades to the lines already produced rather than
 * risking the serverless limit. A caller that receives zero clips still renders a captioned video.
 */
export async function narrateScenes(lines:readonly NarrationLine[],mode:GrowthVoiceMode,
  options:{provider?:VoiceProvider;cache?:Map<string,Promise<VoiceClip>>;now?:()=>number}={}):Promise<NarrationResult>{
  const provider=options.provider??voiceProvider();
  const cache=options.cache??new Map<string,Promise<VoiceClip>>();
  const clock=options.now??(()=>Date.now());
  if(!provider.available())return {mode,provider:provider.id,clips:[],degradedReason:'VOICE_NOT_CONFIGURED'};
  const usable=lines.filter(line=>line.text.trim()).slice(0,VOICE.maxLinesPerVideo);
  const deadline=clock()+VOICE.videoBudgetMs;
  const produced:NarrationClip[]=[];
  let degraded:string|null=null;
  for(let index=0;index<usable.length;index+=VOICE.concurrency){
    if(clock()>=deadline){degraded??='VOICE_BUDGET_EXCEEDED';break;}
    const batch=usable.slice(index,index+VOICE.concurrency);
    const settled=await Promise.allSettled(batch.map(line=>{
      const key=`${mode}:${createHash('sha256').update(line.text.trim()).digest('hex')}`;
      const pending=cache.get(key)??provider.synthesize(line.text,mode);
      cache.set(key,pending);
      return pending.then(clip=>({...line,clip}));
    }));
    for(const [offset,result] of settled.entries()){
      if(result.status==='fulfilled')produced.push(result.value);
      else{
        degraded??=result.reason instanceof VoiceUnavailableError?result.reason.code:'VOICE_SYNTHESIS_FAILED';
        cache.delete(`${mode}:${createHash('sha256').update(batch[offset].text.trim()).digest('hex')}`);
      }
    }
  }
  produced.sort((a,b)=>a.order-b.order);
  return {mode,provider:provider.id,clips:produced,degradedReason:produced.length===usable.length?null:degraded??'VOICE_INCOMPLETE'};
}
