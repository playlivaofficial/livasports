// Collect a bounded Vercel runtime window. Output only sanitized diagnostic evidence.
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
const target=process.argv[2];
if(!/^livasports-[a-z0-9]+-nikapopkha3-4447s-projects\.vercel\.app$/.test(target??''))throw Error('EXISTING_PROJECT_DEPLOYMENT_REQUIRED');
const secrets=[];
for(const file of ['.env','.env.local','.env.production.local','.env.m5-1.local']){
  const env=parseEnv(await readFile(file,'utf8').catch(()=>''));for(const [key,value] of Object.entries(env))if(/SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL/.test(key)&&value.length>=12)secrets.push(value);
}
const safe=text=>secrets.reduce((s,value)=>s.split(value).join('[REDACTED]'),text).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED_DATABASE_URL]').replace(/(api[_-]?(?:key|token)=)[^&\s]+/gi,'$1[REDACTED]');
// The only variable is strictly validated above. No credentials are placed in command arguments.
const child=spawn('cmd.exe',['/d','/s','/c',`pnpm dlx vercel@48.10.1 logs ${target} --scope nikapopkha3-4447s-projects --json`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let partial='',stderr='';const entries=[];
child.stdout.on('data',chunk=>{partial+=chunk.toString();const lines=partial.split(/\r?\n/);partial=lines.pop();for(const line of lines){try{entries.push(JSON.parse(safe(line)));}catch{if(line.trim())entries.push({message:safe(line)});}}});
child.stderr.on('data',chunk=>{stderr+=safe(chunk.toString());});
await new Promise((yes,no)=>{child.once('exit',yes);child.once('error',no);});
const warnings=entries.filter(e=>['error','warning','warn'].includes(e.level)||/error|exception|failed/i.test(String(e.message??'').replace(/"error":null/g,'')));
const events=entries.flatMap(e=>{const match=String(e.message??'').match(/\[LivaSports[^\]]*\]\s*(\{.*\})/);try{return match?[JSON.parse(match[1])]:[];}catch{return [];}});
const cacheEvents=events.reduce((out,e)=>{if(String(e.event).includes('cache'))out[e.event]=(out[e.event]??0)+1;return out;},{});
const result={at:new Date().toISOString(),deployment:target,entries:entries.length,warnings:warnings.map(e=>({level:e.level,message:e.message})),cacheEvents,
  slipResolutions:events.filter(e=>e.event==='slip-resolve').length,normalReadProviderNonzero:events.filter(e=>e.event!=='odds-scheduler'&&Number(e.providerRequests)>0).length,
  collectorStatus:stderr.includes('Error:')?'CHECK_COLLECTOR':'COMPLETE'};
await writeFile('output/m6-production-runtime-private.json',JSON.stringify({result,entries},null,2));console.info(JSON.stringify(result));
if(result.collectorStatus!=='COMPLETE'||!entries.length)process.exitCode=1;
