import type {GeneratedCopy,PublicationFacts} from './policy';
import type {ModelUsage} from './generation';
export const reviewFields=['en.title','en.summary','en.body','es.title','es.summary','es.body','pt.title','pt.summary','pt.body'] as const;
export const issueCodes=['UNSUPPORTED_FACT','SCORE_OR_TEAM','TRANSLATION_DIFFERENCE','LANGUAGE_QUALITY','REPETITION','FORMAT','ATTRIBUTION','COPYING_SIGNAL'] as const;
export interface ReviewIssue {field:typeof reviewFields[number];code:typeof issueCodes[number];reason:string}
export interface EditorialAudit {grounded:boolean;translations:boolean;original:boolean;quality:boolean;issues:ReviewIssue[]}
export interface CorrectionDiagnostic {code:'SHAPE'|'TARGETS'|'MISSING_TARGET'|'EXTRA_TARGET'|'TEXT_TYPE'|'TEXT_LENGTH';field:typeof reviewFields[number]|null}
export interface ReviewEvidence {model:string;rubric:string;facts:PublicationFacts;draft:Partial<GeneratedCopy>;deterministic:string[];audit:EditorialAudit|null;status:string;usage:ModelUsage;correctedFields:string[];correctionDiagnostic?:CorrectionDiagnostic}
export class CorrectionContractError extends Error {
 constructor(readonly diagnostic:CorrectionDiagnostic){super('MODEL_CORRECTION_INVALID');}
}
/** Exactly one required property per permitted field: no empty list, duplicate targets or outside edits. */
export function correctionSchema(targets:readonly string[]){
 if(!targets.length||new Set(targets).size!==targets.length||targets.some(t=>!reviewFields.includes(t as typeof reviewFields[number])))throw new CorrectionContractError({code:'TARGETS',field:null});
 return {type:'object',additionalProperties:false,required:['changes'],properties:{changes:{type:'object',additionalProperties:false,required:[...targets],properties:Object.fromEntries(targets.map(field=>[field,{type:'string',minLength:1,maxLength:field.endsWith('.title')?160:field.endsWith('.summary')?500:1800}]))}}};
}
const privateText=(s:string)=>s.replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]');
export function parseAudit(value:unknown):EditorialAudit|null{
 if(!value||typeof value!=='object')return null;
 const a=value as EditorialAudit;
 if(['grounded','translations','original','quality'].some(k=>typeof (a as unknown as Record<string,unknown>)[k]!=='boolean')||!Array.isArray(a.issues)||a.issues.length>12)return null;
 if(a.issues.some(i=>!i||!reviewFields.includes(i.field)||!issueCodes.includes(i.code)||typeof i.reason!=='string'||!i.reason.trim()||i.reason.length>240))return null;
 return {grounded:a.grounded,translations:a.translations,original:a.original,quality:a.quality,issues:a.issues.map(i=>({field:i.field,code:i.code,reason:privateText(i.reason)}))};
}
export const auditPasses=(a:EditorialAudit|null)=>!!a&&a.grounded&&a.translations&&a.original&&a.quality&&a.issues.length===0;
export function privateEvidence(e:ReviewEvidence,key:string):ReviewEvidence{
 // Constructed values only, never raw API envelopes, prompts or headers.
 const draft:Partial<GeneratedCopy>={};
 for(const lang of ['en','es','pt'] as const){const part=e.draft[lang];if(part)draft[lang]={title:privateText(String(part.title??'').slice(0,160)),summary:privateText(String(part.summary??'').slice(0,500)),body:privateText(String(part.body??'').slice(0,1800))};}
 const safe={...e,draft};return JSON.parse(key?JSON.stringify(safe).replaceAll(key,'[REDACTED]'):JSON.stringify(safe));
}
export function applyCorrections(copy:GeneratedCopy,patch:unknown,targets:readonly string[]):GeneratedCopy{
 correctionSchema(targets);
 const fail=(code:CorrectionDiagnostic['code'],field?:string):never=>{throw new CorrectionContractError({code,field:reviewFields.includes(field as typeof reviewFields[number])?field as typeof reviewFields[number]:null});};
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).join(',')!=='changes')return fail('SHAPE');
 const changes=(patch as {changes:unknown}).changes;
 if(!changes||typeof changes!=='object'||Array.isArray(changes))return fail('SHAPE');
 for(const field of Object.keys(changes))if(!targets.includes(field))return fail('EXTRA_TARGET',field);
 const result=structuredClone(copy);
 for(const target of targets){
  if(!Object.hasOwn(changes,target))return fail('MISSING_TARGET',target);
  const text=(changes as Record<string,unknown>)[target];
  if(typeof text!=='string')return fail('TEXT_TYPE',target);
  const [lang,field]=target.split('.') as [keyof GeneratedCopy,keyof GeneratedCopy['en']];
  if(!text.trim()||text.length>({title:160,summary:500,body:1800}[field]))return fail('TEXT_LENGTH',target);
  result[lang][field]=text;
 }
 return result;
}
