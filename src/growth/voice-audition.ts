/**
 * Natural Voice V1 — bounded ElevenLabs voice audition (owner-run, local only).
 *
 *   pnpm growth:voice-audition                 # list + audition up to 4 PT-BR voices
 *   pnpm growth:voice-audition <voiceId> ...   # audition specific voices
 *
 * Reads ELEVENLABS_API_KEY from the environment and never prints it. Spends at most AUDITION_BUDGET
 * characters (printed before any request), using real LivaSports lines shaped by the production
 * spoken-text layer, in both modes. Writes MP3s and a report to output/voice-audition/<timestamp>/ so
 * the owner can listen and set ELEVENLABS_VOICE_ENERGETIC / ELEVENLABS_VOICE_EDITORIAL in Vercel.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {VOICE} from './config';
import {spokenLine} from './spoken';
import {ElevenLabsVoiceProvider,voiceConfigured,voiceId} from './voice';

const AUDITION_BUDGET=2_400;
const MAX_VOICES=4;
/** Real Traffic Engine copy (hook, table context, odds, CTA) across both delivery modes. */
const SCRIPT:Array<{mode:'ENERGETIC'|'EDITORIAL';text:string}>=[
  {mode:'ENERGETIC',text:'Para tudo: tem jogaço chegando'},
  {mode:'ENERGETIC',text:'Flamengo x Palmeiras · Brasileirão Série A · sáb. · 27/09, 16:00'},
  {mode:'EDITORIAL',text:'Na classificação: Flamengo, 3º. Palmeiras, 5º. Esse é o ponto de partida.'},
  {mode:'EDITORIAL',text:'Salve o jogo e veja a comparação completa no LivaSports.com.'},
];

async function accountVoices(key:string){
  // Needs `voices_read`; a text-to-speech-only key legitimately gets 401 here, and that is fine.
  try{
    const response=await fetch(`${VOICE.baseUrl}/v1/voices`,{headers:{'xi-api-key':key}});
    if(!response.ok)return {voices:[],status:response.status};
    const body=await response.json() as {voices?:Array<{voice_id:string;name:string;labels?:Record<string,string>;verified_languages?:Array<{language?:string;accent?:string}>}>};
    const voices=(body.voices??[]).map(voice=>({id:voice.voice_id,name:voice.name,labels:voice.labels??{},languages:voice.verified_languages??[]}));
    const brazilian=voices.filter(voice=>/portug|brazil|brasil|pt/i.test(JSON.stringify([voice.labels,voice.languages])));
    return {voices:brazilian,status:200};
  }catch{return {voices:[],status:0};}
}

async function main(){
  if(!voiceConfigured())throw new Error('ELEVENLABS_API_KEY is not set in this environment');
  const key=process.env.ELEVENLABS_API_KEY!.trim();
  const requested=process.argv.slice(2).filter(value=>/^[A-Za-z0-9_-]{3,64}$/.test(value));
  const library=requested.length?{voices:[],status:-1}:await accountVoices(key);
  const configured=[voiceId('ENERGETIC'),voiceId('EDITORIAL')];
  const candidates=[...new Set([...configured,...requested,...library.voices.map(voice=>voice.id)])].slice(0,MAX_VOICES+2);
  const lines=SCRIPT.map(line=>({...line,spoken:spokenLine(line.text,{mode:line.mode,hook:line.text.startsWith('Para tudo')})}));
  const perVoice=lines.reduce((sum,line)=>sum+line.spoken.length,0);
  const affordable=Math.max(1,Math.floor(AUDITION_BUDGET/perVoice));
  const selected=candidates.slice(0,affordable);
  console.info(JSON.stringify({event:'audition-plan',voices:selected.length,charactersPerVoice:perVoice,maxCharacters:perVoice*selected.length,budget:AUDITION_BUDGET,libraryStatus:library.status}));
  const directory=join(process.cwd(),'output/voice-audition',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true});
  const provider=new ElevenLabsVoiceProvider(),report:Record<string,unknown>[]=[];
  for(const id of selected){
    process.env.ELEVENLABS_VOICE_ENERGETIC=id;process.env.ELEVENLABS_VOICE_EDITORIAL=id;
    for(const [index,line] of lines.entries()){
      try{
        const clip=await provider.synthesize(line.spoken,line.mode,undefined,{previousText:lines[index-1]?.spoken,nextText:lines[index+1]?.spoken});
        const file=join(directory,`${id}-${index+1}-${line.mode.toLowerCase()}.mp3`);await writeFile(file,clip.data);
        report.push({voice:id,name:library.voices.find(voice=>voice.id===id)?.name??null,configured:configured.includes(id),mode:line.mode,spoken:line.spoken,file,bytes:clip.data.length});
      }catch(error){report.push({voice:id,mode:line.mode,error:error instanceof Error?error.message:'FAILED'});}
    }
  }
  await writeFile(join(directory,'report.json'),JSON.stringify({script:lines,voices:library.voices,report},null,2));
  console.info(JSON.stringify({event:'audition-written',directory,files:report.filter(item=>'file' in item).length,
    listenFor:['Brazilian (not European) Portuguese','club names','no English accent','sentence flow across lines','energy without shouting']}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'AUDITION_FAILED');process.exitCode=1;});
