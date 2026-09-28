/** A single transcription of the encoded sample, not its source script. No prompts bias the transcript. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve('output/social-policy/master'),out=join(root,'audio-transcript.json');
try{
  if(await access(out).then(()=>true,()=>false))throw Error('TRANSCRIPT_ALREADY_EXISTS');
  const auth=JSON.parse(await readFile(join(process.env.APPDATA,'com.vercel.cli/Data/auth.json'),'utf8'));
  const r=await fetch('https://api.vercel.com/v1/projects/prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr/env/zxN3vQMvIsMNeVpX?teamId=team_rtsOqa3gRkQZwndpkXwyMDno',{headers:{Authorization:'Bearer '+auth.token}});
  if(!r.ok)throw Error('CONFIG_HTTP_'+r.status);
  const env=await r.json();if(env.key!=='ELEVENLABS_API_KEY'||!env.decrypted||!env.value)throw Error('VOICE_CONFIG_UNAVAILABLE');
  const form=new FormData();form.set('model_id','scribe_v2');form.set('language_code','pt');form.set('tag_audio_events','true');
  form.set('file',new Blob([await readFile(join(root,'qa-audio.mp3'))],{type:'audio/mpeg'}),'sample.mp3');
  const result=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':env.value},body:form,signal:AbortSignal.timeout(60000)});
  if(!result.ok)throw Error('TRANSCRIPTION_HTTP_'+result.status);
  const body=await result.json();
  const safe={transcriptionRequests:1,source:'Encoded master audio; no script supplied to transcriber',language:body.language_code,languageProbability:body.language_probability,text:body.text,words:body.words};
  await writeFile(out,JSON.stringify(safe,null,2));console.log(JSON.stringify(safe));
}catch(error){console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'AUDIO_AUDIT_FAILED',retry:false}));process.exitCode=1;}
