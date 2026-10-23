// Reads ONLY isolated local evidence; no network, credentials, publication or accounting writes.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateBriefing} from '../src/editorial/automation/generation';
import {copyErrors,factErrors,type GeneratedCopy} from '../src/editorial/automation/policy';
import {applyCorrections,CorrectionContractError,type ReviewEvidence} from '../src/editorial/automation/review';
const sql=(query:string)=>execFileSync('wsl.exe',['-d','Ubuntu','--','/usr/lib/postgresql/18/bin/psql','-h','/home/nika1578/.local/share/livasports-pr75/socket','-p','55475','-U','livasports_v3_qa','-d','livasports_v3_qa','-X','-At','-c',query],{encoding:'utf8',windowsHide:true}).trim();
const e:ReviewEvidence=JSON.parse(sql("SELECT payload FROM editorial_generation_evidence WHERE payload->'facts'->>'sourceId'='nfl-cardinals' AND payload->>'status'='MODEL_CORRECTION_INVALID' ORDER BY created_at DESC LIMIT 1"));
assert.equal(sql('SELECT paused FROM editorial_automation_control'),'t');
const colombia=JSON.parse(sql("SELECT published FROM public.sports_snapshots WHERE snapshot_key='colombia-primera-a:2026 Finalizacion'"));
assert.deepEqual(colombia,JSON.parse(await readFile('output/v3-source-audit/colombia-recheck/reviewed-snapshot.json','utf8')));
const before=sql("SELECT count(*),sum(model_microusd_used),sum(model_microusd_reserved) FROM editorial_automation_runs");
const copy=e.draft as GeneratedCopy;assert.deepEqual(copyErrors(copy,e.facts),[]);
assert.equal(e.facts.kind,'announcement');if(e.facts.kind!=='announcement')throw Error('NOT_ANNOUNCEMENT');
const checks=Object.entries(copy).map(([language,p])=>({language,titleCharacters:p.title.length,summaryCharacters:p.summary.length,bodyCharacters:p.body.length,sourcePresent:p.body.includes(e.facts.kind==='announcement'?e.facts.sourceName:'')}));
const response=(value:unknown)=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:0,output_tokens:0},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
let calls=0;const checkpoints:ReviewEvidence[]=[];
const answers=[copy.en,{es:copy.es,pt:copy.pt},e.audit,e.audit];
const fetcher:typeof fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body));assert.equal(body.store,false);assert.ok(!body.instructions.includes('minimum word count of'));calls++;if(calls>4)throw Error('UNBOUNDED_REPLAY');return response(answers[calls-1]);};
const result=await generateBriefing(e.facts,'offline-synthetic-token',fetcher,async()=>{},async evidence=>{checkpoints.push(structuredClone(evidence));});
assert.equal(result.status,'EDITORIAL_REVIEW_REQUIRED');assert.equal(result.copy,null);assert.equal(calls,4);assert.ok(checkpoints.some(c=>c.status==='AUDIT_FORMAT_CONFLICT'));
const corrected=applyCorrections(copy,{changes:Object.fromEntries(e.correctedFields.map(f=>{const [lang,field]=f.split('.') as [keyof GeneratedCopy,keyof GeneratedCopy['en']];return [f,copy[lang][field]];}))},e.correctedFields);assert.deepEqual(corrected,copy);
let diagnostic;try{applyCorrections(copy,{changes:{}},e.correctedFields);}catch(error){assert.ok(error instanceof CorrectionContractError);diagnostic=error.diagnostic;}
assert.equal(diagnostic?.code,'MISSING_TARGET');
assert.equal(sql("SELECT count(*),sum(model_microusd_used),sum(model_microusd_reserved) FROM editorial_automation_runs"),before);
assert.deepEqual(colombia,JSON.parse(sql("SELECT published FROM public.sports_snapshots WHERE snapshot_key='colombia-primera-a:2026 Finalizacion'")));
console.log(JSON.stringify({offline:true,networkRequests:0,paidCalls:0,checks,retainedTargets:e.correctedFields,retainedAuditFlags:e.audit?{grounded:e.audit.grounded,translations:e.audit.translations,original:e.audit.original,quality:e.audit.quality}:null,originalCorrectionPayloadRetained:false,conflictRemainsPrivate:result.copy===null,scriptedAuditCalls:calls,diagnostic,storedFactsEligibility:factErrors(e.facts),accountingUnchanged:true,paused:true}));
