import {describe,it,expect,vi,afterEach} from 'vitest';
import {extractAnnouncement,announcementErrors} from './announcements';
import {automationLimits,copyErrors,fingerprint,stableFacts,toNewsDraft} from './policy';
import {generateBriefing} from './generation';
import {storyContext} from '../context';
import type {SportsSnapshot} from '@/multisport/model';
const now=new Date('2026-10-27T13:00:00Z');
const candidate={desk:'dimayor-releases',url:'https://dimayor.com.co/2026/10/26/synthetic-schedule-notice',sourceDate:'2026-10-26',headline:'Cambios en la programación de la Fecha 17 de la Liga BetPlay DIMAYOR ll-2026'};
// Narrow factual clause, not a stored source article or generated draft.
const body='DIMAYOR informa que, luego de confirmarse la programación del partido entre Independiente Santa Fe y Once Caldas DAF, válido por los Cuartos de Final de la Copa BetPlay DIMAYOR 2026 y, debido a la disponibilidad del estadio El Campín, se realizaron los siguientes cambios en la programación de los partidos de la Fecha 17 de la Liga BetPlay DIMAYOR ll-2026.';
const copy={
 en:{title:'DIMAYOR updates Liga BetPlay matchday 17 schedule',summary:'DIMAYOR announced schedule changes for Liga BetPlay II-2026 matchday 17.',body:'DIMAYOR announced changes to the Liga BetPlay II-2026 matchday 17 schedule, citing the confirmed Copa fixture between Independiente Santa Fe and Once Caldas DAF and availability of El Campín.'},
 es:{title:'DIMAYOR modifica la programación de la Fecha 17',summary:'DIMAYOR anunció cambios para la Fecha 17 de la Liga BetPlay II-2026.',body:'DIMAYOR anunció cambios en la Fecha 17 de la Liga BetPlay II-2026 por la programación del partido de Copa entre Independiente Santa Fe y Once Caldas DAF y la disponibilidad de El Campín.'},
 pt:{title:'DIMAYOR altera programação da rodada 17',summary:'DIMAYOR anunciou mudanças na rodada 17 da Liga BetPlay II-2026.',body:'DIMAYOR anunciou mudanças na rodada 17 da Liga BetPlay II-2026 devido à programação do jogo da Copa entre Independiente Santa Fe e Once Caldas DAF e à disponibilidade de El Campín.'}
};
describe('confirmed league notice, not an invented fixture schedule',()=>{
 afterEach(()=>vi.useRealTimers());
 it('counts source-format instructions in the pre-request input ceiling',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const f=extractAnnouncement(candidate,body,now)!;
  const probe=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  await generateBriefing(f,'synthetic-token',probe);
  const request=JSON.parse(String(probe.mock.calls[0][1]?.body));
  const padded={...f,padding:''};
  const bytes=Buffer.byteLength(JSON.stringify({facts:padded})+request.instructions+JSON.stringify(request.text.format.schema));
  padded.padding='x'.repeat(automationLimits.maxModelInputBytes-bytes+1);
  const blocked=vi.fn<typeof fetch>();const result=await generateBriefing(padded,'synthetic-token',blocked);
  expect(result.status).toBe('MODEL_LIMIT');expect(result.usage.calls).toBe(0);expect(blocked).not.toHaveBeenCalled();
 });
 it.each([true,false])('requires independent editorial approval, preserving context instructions across all model stages: %s',async approved=>{
  vi.useFakeTimers();vi.setSystemTime(now);const answers=[copy.en,{es:copy.es,pt:copy.pt},{grounded:approved,translations:true,original:true,quality:true,issues:approved?[]:[{field:'en.body',code:'UNSUPPORTED_FACT',reason:'Synthetic grounding rejection.'}]}];
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answers.shift())}]}]})));
  const f=extractAnnouncement(candidate,body,now)!;const result=await generateBriefing(f,'synthetic-token',fetcher);
  expect(!!result.copy).toBe(approved);expect(result.status).toBe(approved?'VALIDATED':'EDITORIAL_REVIEW_REQUIRED');expect(result.verification?.grounded).toBe(approved);expect(fetcher).toHaveBeenCalledTimes(3);
  for(const call of fetcher.mock.calls)expect(JSON.parse(String(call[1]?.body)).instructions).toContain('not a verified rescheduled league fixture');
 });
 it('shows the league and mentioned identities without constructing a same-day match',()=>{
  const f=extractAnnouncement(candidate,body,now)!,draft=toNewsDraft(copy,f,now);
  const s={schemaVersion:1,stage:'League',sourceId:'wikimedia',sourceUrl:'https://example.org/synthetic',retrievedAt:f.observedAt,mode:'manual',competitionId:'colombia-primera-a',sport:'football',season:'2026-II',entities:[{id:'a',name:'Independiente Santa Fe',kind:'club'},{id:'b',name:'Once Caldas DAF',kind:'club'}],events:[{id:'unrelated',stage:'League',scores:null,homeId:'a',awayId:'b',start:f.eventDate,status:'scheduled'}],tables:[],observedAt:f.observedAt} as SportsSnapshot;
  const context=storyContext({...draft,publishedAt:now.toISOString(),updatedAt:now.toISOString(),verifiedAt:now.toISOString()},[s]);
  expect(context?.entities).toHaveLength(2);expect(context?.event).toBeNull();
 });
 it('extracts factual context and classifies the affected league independently of the related cup',()=>{
  const f=extractAnnouncement(candidate,body,now)!;
  expect(f.competition).toBe('colombia-primera-a');expect(announcementErrors(f,now)).toEqual([]);
  expect(f.detail).toMatchObject({type:'schedule-update',matchday:17,season:'2026',phase:'II'});
  expect(JSON.stringify(f.detail)).not.toMatch(/kickoff|newStart|previousStart|score|eventDate/);
  expect(copyErrors(copy,f)).toEqual([]);expect(toNewsDraft(copy,f,now).competition).toBe('colombia-primera-a');
 });
 it.each(['Fecha 18','Copa BetPlay DIMAYOR 2025','estadio Otro Estadio','no se realizaron los siguientes cambios','sin cambios'])('quarantines conflicting or missing primary assertions: %s',change=>{
  const changed=change==='sin cambios'?body+' Sin cambios.':change.startsWith('Fecha')?body.replace('Fecha 17',change):change.startsWith('Copa')?body.replace('Copa BetPlay DIMAYOR 2026',change):change.startsWith('estadio')?body.replace('estadio El Campín',change):body.replace('se realizaron los siguientes cambios',change);
  expect(extractAnnouncement(candidate,changed,now)).toBeNull();
 });
 it('keeps old notices and wrong source/competition identities out',()=>{
  expect(extractAnnouncement({...candidate,sourceDate:'2026-10-01'},body,now)).toBeNull();
  expect(extractAnnouncement({...candidate,url:'https://unapproved.invalid/schedule'},body,now)).toBeNull();
  const f=extractAnnouncement(candidate,body,now)!;expect(announcementErrors({...f,competition:'copa-colombia'},now)).not.toEqual([]);
 });
 it('retains stable JSONB fingerprints and detects a changed matchday',()=>{
  const f=extractAnnouncement(candidate,body,now)!;
  const reordered=structuredClone(f);reordered.detail=Object.fromEntries(Object.entries(f.detail).reverse()) as typeof f.detail;
  expect(announcementErrors(reordered,now)).toEqual([]);expect(fingerprint(stableFacts(reordered))).toBe(fingerprint(stableFacts(f)));
  const next=extractAnnouncement({...candidate,headline:candidate.headline.replace('17','18')},body.replace('17','18'),now)!;
  expect(fingerprint(stableFacts(next))).not.toBe(fingerprint(stableFacts(f)));
 });
 it('rejects invented kickoff times even if their digits happen to be allowed',()=>{
  const f=extractAnnouncement(candidate,body,now)!;
  for(const extra of [' Kickoff is 17:17.',' Kickoff is 17 pm.',' The score was 3-1.'])expect(copyErrors({...copy,en:{...copy.en,body:copy.en.body+extra}},f)).not.toEqual([]);
  expect(copyErrors({...copy,en:{...copy.en,body:copy.en.body.replace('Once Caldas DAF','Another Club')}},f)).toContain('en:MISSING_SOURCE_OR_ENTITY');
 });
});
