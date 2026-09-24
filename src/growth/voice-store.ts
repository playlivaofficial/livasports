import 'server-only';
import type {QueryExecutor} from '@/database/client';
import type {VoiceClip,VoiceClipStore} from './voice';

/**
 * Database-backed narration cache (migration 038). Every failure — including the table not existing
 * yet because code shipped before the migration — degrades to "not cached", never to a failed render.
 */
export function databaseVoiceStore(db:QueryExecutor):VoiceClipStore{
  let disabled=false;
  const guard=async<T>(work:()=>Promise<T>,fallback:T):Promise<T>=>{
    if(disabled)return fallback;
    try{return await work();}catch(error){if((error as {code?:string}).code==='42P01')disabled=true;return fallback;}
  };
  return {
    get:key=>guard(async()=>{
      const row=(await db.query<{audio_data:Buffer;sha256:string;voice_mode:VoiceClip['mode']}>(
        `UPDATE growth_voice_clips SET last_used_at=now(),use_count=use_count+1 WHERE cache_key=$1 RETURNING audio_data,sha256,voice_mode`,[key])).rows[0];
      return row&&Buffer.isBuffer(row.audio_data)?{mode:row.voice_mode,mimeType:'audio/mpeg' as const,data:row.audio_data,sha256:String(row.sha256).trim()}:null;
    },null),
    put:(key,clip,meta)=>guard(async()=>{
      await db.query(`INSERT INTO growth_voice_clips(cache_key,provider,voice_id,model,voice_mode,spoken_text,characters,mime_type,sha256,byte_length,audio_data)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(cache_key) DO NOTHING`,
        [key,meta.provider.slice(0,40),meta.voiceId.slice(0,64),meta.model.slice(0,64),meta.mode,meta.text.slice(0,600),meta.characters,clip.mimeType,clip.sha256,clip.data.length,clip.data]);
    },undefined),
  };
}
