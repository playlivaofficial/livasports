import type {GeneratedCopy,ResultFacts} from './policy';
import type {ModelUsage} from './generation';
export const reviewFields=['en.title','en.summary','en.body','es.title','es.summary','es.body','pt.title','pt.summary','pt.body'] as const;
export const issueCodes=['UNSUPPORTED_FACT','SCORE_OR_TEAM','TRANSLATION_DIFFERENCE','LANGUAGE_QUALITY','REPETITION','FORMAT','ATTRIBUTION','COPYING_SIGNAL'] as const;
export interface ReviewIssue {field:typeof reviewFields[number];code:typeof issueCodes[number];reason:string}
export interface EditorialAudit {grounded:boolean;translations:boolean;original:boolean;quality:boolean;issues:ReviewIssue[]}
export interface ReviewEvidence {model:string;rubric:string;facts:ResultFacts;draft:Partial<GeneratedCopy>;deterministic:string[];audit:EditorialAudit|null;status:string;usage:ModelUsage;correctedFields:string[]}
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
 const changes=(patch as {changes?:unknown})?.changes;
 if(!Array.isArray(changes)||!changes.length||changes.length>9)throw Error('MODEL_CORRECTION_INVALID');
 const result=structuredClone(copy),seen=new Set<string>();
 for(const c of changes){if(!c||!targets.includes(c.field)||!reviewFields.includes(c.field)||seen.has(c.field)||typeof c.text!=='string'||c.text.length>1800)throw Error('MODEL_CORRECTION_INVALID');seen.add(c.field);const [lang,field]=c.field.split('.') as [keyof GeneratedCopy,keyof GeneratedCopy['en']];result[lang][field]=c.text;}
 return result;
}
