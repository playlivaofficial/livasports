import type {EventFacts} from './policy';
export interface PublicationMix {sport:string;sourceId:string;count:number}
const sport=(f:EventFacts)=>f.kind==='result'?'football':f.kind==='announcement'?f.sport:'unknown';
/** Only already-eligible facts enter ranking. Diversity never grants factual eligibility. */
export function rankNews<T extends {eventKey:string;facts:EventFacts}>(rows:T[],mix:PublicationMix[]):T[]{
 const total=(s:string)=>mix.filter(m=>m.sport===s).reduce((n,m)=>n+m.count,0);
 const source=(f:EventFacts)=>f.kind==='metadata'?f.candidate.desk:f.sourceId;
 const count=(f:EventFacts)=>mix.filter(m=>m.sourceId===source(f)).reduce((n,m)=>n+m.count,0);
 const date=(f:EventFacts)=>f.kind==='metadata'?'':f.eventDate;
 return [...rows].sort((a,b)=>total(sport(a.facts))-total(sport(b.facts))||count(a.facts)-count(b.facts)||date(b.facts).localeCompare(date(a.facts))||a.eventKey.localeCompare(b.eventKey));
}
