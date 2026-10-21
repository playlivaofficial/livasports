import {createHash} from 'node:crypto';
import {assertOpenLigaSnapshot} from '@/multisport/openligadb';
import {validateSnapshot,type SportsSnapshot} from '@/multisport/model';
import type {NewsDraft} from '../model';
import {validateNewsDraft} from '../model';
import {discoveryDesks,type DiscoveryCandidate} from '../discovery';

export const automationLimits=Object.freeze({minIntervalMs:6*3600000,maxRunsPerDay:4,maxRequestsPerDay:16,maxPending:500,maxEventsPerRun:2,maxModelCalls:3,maxModelInputBytes:18000,maxOutputTokens:2200,reserveMicroUsd:20000,maxDailyMicroUsd:100000,maxMonthlyMicroUsd:3000000,maxValidationMicroUsd:1000000});
export const automationSources=[
  {id:'openliga-results',name:'OpenLigaDB · verified stored results',sport:'football',permission:'structured-facts',automaticAccess:true,rights:'ODbL 1.0; attribution and normalized database export retained',url:'https://www.openligadb.de/',requestLimit:0},
  ...discoveryDesks.map(d=>({id:d.id,name:d.name,sport:d.sport,permission:'metadata-review',automaticAccess:false,rights:'Scheduled collection not authorized yet. Owner-imported citations only; no article/image reuse or automatic publication grant',url:d.url,requestLimit:2})),
] as const;
export interface ResultFacts {
  kind:'result'; eventKey:string; sourceId:'openliga-results'; sourceUrl:string;
  competition:'bundesliga'; season:string; eventId:string; observedAt:string; eventDate:string;
  home:{id:string;name:string}; away:{id:string;name:string}; homeScore:number; awayScore:number;
  status:'completed'; sourceSnapshotHash:string;
}
export interface MetadataFacts {kind:'metadata';candidate:DiscoveryCandidate}
export type EventFacts=ResultFacts|MetadataFacts;
function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';}
export const fingerprint=(facts:EventFacts)=>createHash('sha256').update(canonical(facts)).digest('hex');
export const eventKey=(facts:EventFacts)=>facts.kind==='result'?facts.eventKey:`citation:${createHash('sha256').update(facts.candidate.url).digest('hex')}`;
export function factErrors(facts:EventFacts,now=new Date()):string[]{
  if(facts.kind!=='result')return ['SOURCE_RIGHTS_AND_FACT_REVIEW'];
  if(facts.sourceId!=='openliga-results'||facts.competition!=='bundesliga'||!/^openligadb-match-\d+$/.test(facts.eventId)||facts.sourceUrl!==`https://api.openligadb.de/getmatchdata/${facts.eventId.replace('openligadb-match-','')}`||facts.status!=='completed')return ['SOURCE_NOT_APPROVED'];
  if(!facts.home.id||!facts.away.id||facts.home.id===facts.away.id||!facts.home.name||!facts.away.name||facts.home.name===facts.away.name)return ['ENTITY_CONFLICT'];
  if(![facts.homeScore,facts.awayScore].every(n=>Number.isInteger(n)&&n>=0&&n<=30))return ['INVALID_RESULT'];
  const observed=Date.parse(facts.observedAt),date=Date.parse(facts.eventDate);
  if(!Number.isFinite(observed)||!Number.isFinite(date)||observed>+now||date>observed||+now-date>7*86400000)return ['STALE_OR_INVALID_DATE'];
  return [];
}
/** Only the existing mathematically reconciled, published ODbL dataset can supply automatic facts.
 * Wikimedia tables and metadata headlines are NOT treated as verified results. */
export function resultsFromSnapshot(snapshot:SportsSnapshot,now=new Date()):ResultFacts[]{
  if(snapshot.sourceId!=='openligadb'||snapshot.competitionId!=='bundesliga'||snapshot.mode==='historical'||validateSnapshot(snapshot,now).length)return [];
  try{assertOpenLigaSnapshot(snapshot,now);}catch{return [];}
  return snapshot.events.filter(e=>e.status==='completed'&&e.start&&e.scores).map(e=>{
    const home=snapshot.entities.find(x=>x.id===e.homeId)!,away=snapshot.entities.find(x=>x.id===e.awayId)!;
    const facts:ResultFacts={kind:'result',eventKey:`bundesliga:${snapshot.season}:${e.id}`,sourceId:'openliga-results',sourceUrl:`https://api.openligadb.de/getmatchdata/${e.id.replace('openligadb-match-','')}`,competition:'bundesliga',season:snapshot.season,eventId:e.id,observedAt:snapshot.observedAt,eventDate:e.start!,home:{id:home.id,name:home.name},away:{id:away.id,name:away.name},homeScore:e.scores!.home,awayScore:e.scores!.away,status:'completed',sourceSnapshotHash:createHash('sha256').update(canonical({event:e,home:home.name,away:away.name})).digest('hex')};
    return facts;
  }).filter(f=>!factErrors(f,now).length).sort((a,b)=>b.eventDate.localeCompare(a.eventDate));
}
/** Observation time advancing alone is not a correction of the match result. */
export function stableFacts(facts:EventFacts):EventFacts{return facts.kind==='result'?{...facts,observedAt:facts.eventDate}:facts;}
export function publicationSlug(f:ResultFacts){return `result-${createHash('sha256').update(f.eventKey).digest('hex').slice(0,24)}`;}
export interface GeneratedCopy {en:{title:string;summary:string;body:string};es:{title:string;summary:string;body:string};pt:{title:string;summary:string;body:string}}
export function copyErrors(copy:GeneratedCopy,facts:ResultFacts):string[]{
  const errors:string[]=[];
  const permittedNumbers=new Set([String(facts.homeScore),String(facts.awayScore),...(facts.home.name+' '+facts.away.name).match(/\d+/g)??[]]);
  for(const lang of ['en','es','pt'] as const){
    const part=copy?.[lang];
    if(!part||Object.keys(part).sort().join(',')!=='body,summary,title'||Object.values(part).some(v=>typeof v!=='string')){errors.push(`${lang}:INVALID_COPY`);continue;}
    const text=[part.title,part.summary,part.body].join(' ');
    if(part.body.length>1800||/[<>]|https?:|\b(?:bet|odds|apuesta|cuota|aposte|injur\w*|lesion\w*|lesão|transfer\w*|exclusive|exclusiv\w*|according to sources)\b/i.test(text)||/["“”]/.test(text))errors.push(`${lang}:UNSUPPORTED_CLAIM_OR_FORMAT`);
    if(!part.body.includes(facts.home.name)||!part.body.includes(facts.away.name)||!part.body.includes('OpenLigaDB'))errors.push(`${lang}:MISSING_SOURCE_OR_ENTITY`);
    if(!part.body.includes(`${facts.homeScore}–${facts.awayScore}`))errors.push(`${lang}:RESULT_MISMATCH`);
    if((text.match(/\d+/g)??[]).some(n=>!permittedNumbers.has(n)))errors.push(`${lang}:UNSUPPORTED_NUMBER`);
  }
  if(copy?.en?.body===copy?.es?.body||copy?.en?.body===copy?.pt?.body||copy?.es?.body===copy?.pt?.body)errors.push('TRANSLATION_NOT_DISTINCT');
  return errors;
}
export function toNewsDraft(copy:GeneratedCopy,f:ResultFacts,now=new Date()):NewsDraft{
  const draft:NewsDraft={slug:publicationSlug(f),country:'international',competition:'bundesliga',sport:'football',title:{en:copy.en.title,es:copy.es.title,pt:copy.pt.title},summary:{en:copy.en.summary,es:copy.es.summary,pt:copy.pt.summary},body:{en:copy.en.body,es:copy.es.body,pt:copy.pt.body},sourceName:'OpenLigaDB · ODbL 1.0',sourceUrl:f.sourceUrl,sourcePublishedOn:f.eventDate.slice(0,10),image:'none',imageCaption:{en:'',es:'',pt:''},featured:false};
  draft.originalLanguage='en';
  draft.translationReview={en:{state:'validated',reviewedAt:now.toISOString()},es:{state:'validated',reviewedAt:now.toISOString()},pt:{state:'validated',reviewedAt:now.toISOString()}};
  if(factErrors(f,now).length||copyErrors(copy,f).length||validateNewsDraft(draft,now).length)throw Error('PUBLICATION_POLICY_FAILED');
  return draft;
}
