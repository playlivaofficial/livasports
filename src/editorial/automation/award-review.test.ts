import {describe,it,expect,vi,afterEach} from 'vitest';
import {extractAnnouncement} from './announcements';
import {generateBriefing} from './generation';
import {copyErrors,type GeneratedCopy} from './policy';
const now=new Date('2026-10-23T08:00:00Z');
const facts=extractAnnouncement({desk:'nfl-cardinals',url:'https://azcardinals.com/news/synthetic-award',headline:'Synthetic Player Named NFC Special Teams Player Of The Week',sourceDate:'2026-10-21'},'Synthetic Player received NFC Special Teams Player of the Week, which the NFL bestowed upon Player on Wednesday.',now)!;
const copy:GeneratedCopy={en:{title:'Synthetic Player receives weekly award',summary:'Arizona Cardinals announced the weekly award for Synthetic Player.',body:'Arizona Cardinals reports Synthetic Player as NFC Special Teams Player of the Week.'},es:{title:'Synthetic Player recibe el premio semanal',summary:'Arizona Cardinals anunció el premio semanal para Synthetic Player.',body:'Según Arizona Cardinals, Synthetic Player recibió el premio semanal de equipos especiales de la NFC.'},pt:{title:'Synthetic Player recebe prêmio semanal',summary:'Arizona Cardinals anunciou o prêmio semanal para Synthetic Player.',body:'Segundo Arizona Cardinals, Synthetic Player recebeu o prêmio semanal de equipes especiais da NFC.'}};
const pass={grounded:true,translations:true,original:true,quality:true,issues:[]};
const conflict={...pass,quality:false,issues:[{field:'en.body',code:'FORMAT',reason:'The minimum is met and the wording is concise and compliant.'}]};
const response=(v:unknown)=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(v)}]}]}));
const model=(...answers:unknown[])=>vi.fn<typeof fetch>().mockImplementation(async()=>response(answers.shift()));
afterEach(()=>vi.useRealTimers());
describe('concise award reporting and conflicting audit',()=>{
 it('accepts a brief only after an independent all-pass verdict',async()=>{vi.useFakeTimers();vi.setSystemTime(now);expect(copyErrors(copy,facts)).toEqual([]);const fetcher=model(copy.en,{es:copy.es,pt:copy.pt},pass);const result=await generateBriefing(facts,'synthetic-token',fetcher);expect(result.status).toBe('VALIDATED');expect(fetcher).toHaveBeenCalledTimes(3);});
 it.each([pass,conflict])('reconciles a contradictory FORMAT finding once, never auto-approves',async audit=>{vi.useFakeTimers();vi.setSystemTime(now);const save=vi.fn(),fetcher=model(copy.en,{es:copy.es,pt:copy.pt},conflict,audit);const result=await generateBriefing(facts,'synthetic-token',fetcher,async()=>{},save);expect(fetcher).toHaveBeenCalledTimes(4);expect(result.copy).toEqual(audit===pass?copy:null);expect(save.mock.calls.some(([e])=>e.status==='AUDIT_FORMAT_CONFLICT')).toBe(true);const request=JSON.parse(String(fetcher.mock.calls[3][1]?.body));expect(request.input).toContain('bodyCharacters');expect(request.input).toContain('sourcePresent');});
 it('does not reconcile away a grounding failure',async()=>{vi.useFakeTimers();vi.setSystemTime(now);const fetcher=model(copy.en,{es:copy.es,pt:copy.pt},{...conflict,grounded:false});const r=await generateBriefing(facts,'synthetic-token',fetcher);expect(r.copy).toBeNull();expect(fetcher).toHaveBeenCalledTimes(3);});
 it('retains safe correction-contract diagnostics without raw response or extra calls',async()=>{vi.useFakeTimers();vi.setSystemTime(now);const save=vi.fn(),fetcher=model(copy.en,{es:copy.es,pt:copy.pt},{...pass,quality:false,issues:[{field:'es.body',code:'LANGUAGE_QUALITY',reason:'Concrete fluency error.'}]},{changes:{'en.body':'Outside target'}});const r=await generateBriefing(facts,'synthetic-token',fetcher,async()=>{},save);expect(r.copy).toBeNull();expect(r.status).toBe('MODEL_CORRECTION_INVALID');expect(fetcher).toHaveBeenCalledTimes(4);expect(save.mock.calls.at(-1)?.[0].correctionDiagnostic).toEqual({code:'EXTRA_TARGET',field:'en.body'});const schema=JSON.parse(String(fetcher.mock.calls[3][1]?.body)).text.format.schema;expect(Object.keys(schema.properties.changes.properties)).toEqual(['es.body']);});
 it('enforces title/summary lengths and unchanged factual/translation checks deterministically',()=>{expect(copyErrors({...copy,en:{...copy.en,title:'Short'}},facts)).toContain('en:TITLE_LENGTH');expect(copyErrors({...copy,es:{...copy.es,summary:'Short'}},facts)).toContain('es:SUMMARY_LENGTH');expect(copyErrors({...copy,pt:{...copy.pt,body:copy.pt.body+' 35 touchdowns.'}},facts)).toContain('pt:UNSUPPORTED_NUMBER');expect(copyErrors({...copy,pt:copy.en},facts)).toContain('TRANSLATION_NOT_DISTINCT');});
});

it('keeps a post-correction fluency failure private within the same five-call ceiling',async()=>{
 vi.useFakeTimers();vi.setSystemTime(now);
 const fail={...pass,quality:false,issues:[{field:'es.body',code:'ATTRIBUTION',reason:'The reporting authority is ambiguous.'}]};
 const stillBad={...pass,quality:false,issues:[{field:'es.body',code:'LANGUAGE_QUALITY',reason:'The corrected clause has incorrect agreement.'}]};
 const fetcher=model(copy.en,{es:copy.es,pt:copy.pt},fail,{changes:{'es.body':copy.es.body}},stillBad);
 const result=await generateBriefing(facts,'synthetic-token',fetcher);
 expect(result.copy).toBeNull();expect(result.status).toBe('EDITORIAL_REVIEW_REQUIRED');expect(fetcher).toHaveBeenCalledTimes(5);
 expect(result.verification?.quality).toBe(false);
 const instructions=JSON.parse(String(fetcher.mock.calls[3][1]?.body)).instructions;
 expect(instructions).toContain('Según');expect(instructions).toContain('Segundo');expect(instructions).toContain('idiomatic grammar');
});
