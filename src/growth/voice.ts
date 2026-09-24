import 'server-only';
import {createHash} from 'node:crypto';
import {VOICE,type GrowthVoiceMode} from './config';
import {spokenLine} from './spoken';

/**
 * Brazilian Portuguese narration.
 *
 * A provider boundary rather than a direct integration: the renderer asks for audio for a line of
 * script and never learns who produced it. ElevenLabs is the configured provider; an unconfigured
 * environment returns an explicitly unavailable provider so preview builds, CI and local runs keep
 * producing the same captioned video instead of failing.
 *
 * The credential is read from `process.env.ELEVENLABS_API_KEY` at call time and is never logged,
 * returned, embedded in an asset, or written to the database.
 *
 * Natural Voice V1 adds three things on top of the Premium Creative integration:
 *  - every caption is rewritten into spoken Brazilian Portuguese before synthesis (`spoken.ts`);
 *  - each line is synthesised with its neighbours as `previous_text`/`next_text`, which is the
 *    provider's own mechanism for continuous prosody across separately generated clips — the
 *    scene-to-scene "reset" of intonation was the most audible synthetic artefact;
 *  - a persistent clip store keyed by everything that changes the audio, so an unchanged line is
 *    never paid for twice, across platforms, retries, regenerations or visual-only re-renders.
 *
 * Runtime safety: every request is individually timed out, the whole video shares one synthesis
 * budget, responses are size bounded, and identical requests are synthesised once.
 */

export interface VoiceClip {
  mode:GrowthVoiceMode;
  /** MP3 is what ElevenLabs returns and what FFmpeg decodes without a re-encode decision. */
  mimeType:'audio/mpeg';
  data:Buffer;
  sha256:string;
}
export interface SynthesisRequest {previousText?:string;nextText?:string;seed?:number;}
export interface VoiceProvider {
  readonly id:string;
  /** False when no credential is configured; callers degrade to an unvoiced render, never an error. */
  available():boolean;
  synthesize(text:string,mode:GrowthVoiceMode,signal?:AbortSignal,request?:SynthesisRequest):Promise<VoiceClip>;
  /** The provider-side voice for a mode — part of the cache identity. Never a credential. */
  voiceFor?(mode:GrowthVoiceMode):string;
}
/** Durable narration cache. Implementations must never throw into the render path. */
export interface VoiceClipStore {
  get(key:string):Promise<VoiceClip|null>;
  put(key:string,clip:VoiceClip,meta:{provider:string;voiceId:string;model:string;mode:GrowthVoiceMode;characters:number;text:string}):Promise<void>;
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
export function voiceId(mode:GrowthVoiceMode):string{
  const override=(mode==='ENERGETIC'?process.env.ELEVENLABS_VOICE_ENERGETIC:process.env.ELEVENLABS_VOICE_EDITORIAL)?.trim();
  return override&&/^[A-Za-z0-9_-]{3,64}$/.test(override)?override:VOICE.defaultVoices[mode];
}
/** True when both modes use a voice chosen for this account rather than the generic premade fallback. */
export const voicesPinned=()=>(['ENERGETIC','EDITORIAL'] as const).every(mode=>voiceId(mode)!==VOICE.defaultVoices[mode]);

/** A stable 32-bit seed per spoken line: the same line regenerates the same take. */
export const lineSeed=(text:string)=>createHash('sha256').update(text).digest().readUInt32BE(0)%4_294_967_295;

export class ElevenLabsVoiceProvider implements VoiceProvider{
  readonly id='elevenlabs';
  available(){return voiceConfigured();}
  voiceFor(mode:GrowthVoiceMode){return voiceId(mode);}
  async synthesize(text:string,mode:GrowthVoiceMode,signal?:AbortSignal,request:SynthesisRequest={}):Promise<VoiceClip>{
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
    if(signal?.aborted)controller.abort();
    try{
      const response=await fetch(`${VOICE.baseUrl}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${VOICE.outputFormat}`,{
        method:'POST',signal:controller.signal,
        headers:{'xi-api-key':key,'content-type':'application/json',accept:'audio/mpeg'},
        body:JSON.stringify({text:trimmed,model_id:VOICE.model,language_code:VOICE.language,
          // Continuity: the provider conditions this take on the lines around it.
          ...(request.previousText?{previous_text:request.previousText.slice(0,VOICE.maxCharacters)}:{}),
          ...(request.nextText?{next_text:request.nextText.slice(0,VOICE.maxCharacters)}:{}),
          ...(request.seed!==undefined?{seed:request.seed}:{}),
          voice_settings:{stability:settings.stability,similarity_boost:settings.similarity,style:settings.style,speed:settings.speed,use_speaker_boost:true}}),
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

/** The explicit "no credential" provider. Keeps the unvoiced path a deliberate state, not an exception. */
export class UnavailableVoiceProvider implements VoiceProvider{
  readonly id='unavailable';
  available(){return false;}
  async synthesize():Promise<VoiceClip>{throw new VoiceUnavailableError('VOICE_NOT_CONFIGURED');}
}

export function voiceProvider():VoiceProvider{
  return voiceConfigured()?new ElevenLabsVoiceProvider():new UnavailableVoiceProvider();
}

export interface NarrationLine {order:number;startSeconds:number;text:string;}
export interface NarrationClip extends NarrationLine {clip:VoiceClip;spoken:string;}
export interface NarrationResult {
  mode:GrowthVoiceMode;
  provider:string;
  voiceId?:string;
  clips:NarrationClip[];
  /** Why narration is absent or partial, for the owner queue. Null when every line was produced. */
  degradedReason:string|null;
  /** Where each clip came from; synthesized × characters is what the provider billed. */
  cache?:{memoryHits:number;storeHits:number;synthesized:number;characters:number};
}

/**
 * Cache identity: everything that changes the produced audio, nothing that does not. Two platforms
 * speaking the same line with the same neighbours in the same mode share one clip.
 */
export function narrationCacheKey(input:{provider:string;voiceId:string;mode:GrowthVoiceMode;text:string;previousText?:string;nextText?:string;seed:number}){
  return createHash('sha256').update(JSON.stringify({v:VOICE.cacheVersion,provider:input.provider,voice:input.voiceId,model:VOICE.model,language:VOICE.language,
    format:VOICE.outputFormat,settings:VOICE.modes[input.mode],text:input.text,previous:input.previousText??'',next:input.nextText??'',seed:input.seed})).digest('hex');
}

/**
 * Narrate one platform draft. Lines are shaped into spoken Portuguese, resolved from the in-memory
 * cache, then the durable store, and only then synthesised — in a small pool, under a shared
 * wall-clock budget. Exceeding the budget degrades to the lines already produced rather than risking
 * the serverless limit; a caller that receives zero clips still renders a captioned video.
 */
export async function narrateScenes(lines:readonly NarrationLine[],mode:GrowthVoiceMode,
  options:{provider?:VoiceProvider;cache?:Map<string,Promise<VoiceClip>>;store?:VoiceClipStore;now?:()=>number;deadlineMs?:number}={}):Promise<NarrationResult>{
  const provider=options.provider??voiceProvider();
  const cache=options.cache??new Map<string,Promise<VoiceClip>>();
  const clock=options.now??(()=>Date.now());
  if(!provider.available())return {mode,provider:provider.id,clips:[],degradedReason:'VOICE_NOT_CONFIGURED'};
  const voice=provider.voiceFor?.(mode)??provider.id;
  const usable=lines.filter(line=>line.text.trim()).slice(0,VOICE.maxLinesPerVideo);
  const spoken=usable.map((line,index)=>spokenLine(line.text,{mode,hook:index===0}));
  const deadline=Math.min(clock()+VOICE.videoBudgetMs,options.deadlineMs??Infinity);
  const produced:NarrationClip[]=[];
  const stats={memoryHits:0,storeHits:0,synthesized:0,characters:0};
  let degraded:string|null=null;
  for(let index=0;index<usable.length;index+=VOICE.concurrency){
    if(clock()>=deadline){degraded??='VOICE_BUDGET_EXCEEDED';break;}
    const batch=usable.slice(index,index+VOICE.concurrency).map((line,offset)=>{
      const position=index+offset,text=spoken[position]!,previousText=spoken[position-1],nextText=spoken[position+1],seed=lineSeed(text);
      return {line,text,request:{previousText,nextText,seed},key:narrationCacheKey({provider:provider.id,voiceId:voice,mode,text,previousText,nextText,seed})};
    });
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-clock()));
    const settled=await Promise.allSettled(batch.map(item=>{
      let pending=cache.get(item.key);
      if(pending)stats.memoryHits++;
      else{
        pending=(async()=>{
          const stored=options.store?await options.store.get(item.key).catch(()=>null):null;
          if(stored){stats.storeHits++;return stored;}
          const clip=await provider.synthesize(item.text,mode,controller.signal,item.request);
          stats.synthesized++;stats.characters+=item.text.length;
          await options.store?.put(item.key,clip,{provider:provider.id,voiceId:voice,model:VOICE.model,mode,characters:item.text.length,text:item.text}).catch(()=>undefined);
          return clip;
        })();
        cache.set(item.key,pending);
      }
      return pending.then(clip=>({...item.line,clip,spoken:item.text}));
    }));
    clearTimeout(timer);
    for(const [offset,result] of settled.entries()){
      if(result.status==='fulfilled')produced.push(result.value);
      else{
        degraded??=result.reason instanceof VoiceUnavailableError?result.reason.code:'VOICE_SYNTHESIS_FAILED';
        cache.delete(batch[offset]!.key);
      }
    }
  }
  produced.sort((a,b)=>a.order-b.order);
  return {mode,provider:provider.id,voiceId:voice,clips:produced,cache:stats,
    degradedReason:produced.length===usable.length?null:degraded??'VOICE_INCOMPLETE'};
}
