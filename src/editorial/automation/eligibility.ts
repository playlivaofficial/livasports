import {factErrors, type EventFacts} from './policy';

/** Publication age and evidence age are separate. A seven-day story still needs
 * recent primary-source corroboration; an old queued fact is not a fresh read. */
export function generationEligible(facts:EventFacts, now=new Date(), resultsValidated=true):boolean {
 if(factErrors(facts,now).length)return false;
 if(facts.kind==='result')return resultsValidated;
 return facts.kind==='announcement' && now.getTime()-Date.parse(facts.observedAt)<=24*3600000;
}

/** Only a successful, independently parsed identical fact observation can refresh
 * evidence time. A 304, source failure or metadata-only item cannot do this. */
export function newerCorroboration(old:EventFacts, incoming:EventFacts, now=new Date()):boolean {
 return old.kind==='announcement' && incoming.kind==='announcement' &&
  factErrors(incoming,now).length===0 && Date.parse(incoming.observedAt)>Date.parse(old.observedAt);
}
