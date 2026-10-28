import {isDeepStrictEqual} from 'node:util';
import {audienceValidatorVersion} from './nba-audience';
import {copyErrors,eventKey,factErrors,fingerprint,stableFacts,type EventFacts} from './policy';
import type {AutomationEvent} from './repository';
import type {ReviewEvidence} from './review';

/** Reviewed software defect only. Adding another correction requires code review and its own proof. */
export const validatorCorrection=Object.freeze({id:'nba-average-inflections-v1',version:'nba-audience-average-inflections-v1',sourceId:'nba-releases',failure:'DETERMINISTIC_VALIDATION_FAILED',diagnostic:'en:AUDIENCE_MEASURE_OR_ATTRIBUTION_MISSING'});
export interface RecoveryTicket {eventKey:string;fingerprint:string;revision:number;originalRunId:string;correctionId:string}
/** A successful English replay is defect evidence only, never editorial approval. */
export function provenValidatorDefect(event:AutomationEvent,evidence:ReviewEvidence,now=new Date()):boolean {
 try{
  if(audienceValidatorVersion!==validatorCorrection.version||event.state!=='review'||event.reason!==validatorCorrection.failure||event.attempts!==1||event.newsSlug||event.publicationRevision!==null)return false;
  const facts=event.facts;if(facts.kind!=='announcement'||facts.sourceId!==validatorCorrection.sourceId||facts.detail.type!=='broadcast-audience'||factErrors(facts,now).length)return false;
  if(eventKey(facts)!==event.eventKey||fingerprint(stableFacts(facts))!==event.fingerprint||fingerprint(stableFacts(evidence.facts))!==event.fingerprint)return false;
  if(evidence.status!==validatorCorrection.failure||evidence.validatorVersion!==undefined||evidence.rubric!=='announcement-brief-v3'||evidence.audit!==null||evidence.correctedFields.length||evidence.correctionDiagnostic)return false;
  if(!isDeepStrictEqual(evidence.deterministic,[validatorCorrection.diagnostic])||evidence.usage.calls!==1||evidence.usage.failure||evidence.usage.audit||Object.keys(evidence.usage.stages??{}).join(',')!=='original')return false;
  if(Object.keys(evidence.draft).join(',')!=='en'||!evidence.draft.en)return false;
  const en=evidence.draft.en;
  // Reproduce the faulty word-boundary predicate, rather than trusting a broad error label.
  if(/\baverage\b/i.test(en.body)||!/\b(?:averaged|averages|averaging)\b/i.test(en.body))return false;
  return copyErrors({en,es:en,pt:en},facts).filter(x=>x.startsWith('en:')).length===0;
 }catch{return false;}
}
export function freshlyCorroborated(ticket:RecoveryTicket,facts:EventFacts,now=new Date()):boolean {
 return facts.kind==='announcement'&&ticket.correctionId===validatorCorrection.id&&eventKey(facts)===ticket.eventKey&&fingerprint(stableFacts(facts))===ticket.fingerprint&&factErrors(facts,now).length===0&&facts.observedAt===now.toISOString();
}
