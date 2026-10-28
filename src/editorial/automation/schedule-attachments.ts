import {createHash} from 'node:crypto';
/** Facts-only transcription of both rendered pages, not a licence to republish PDF artwork.
 * Unseen/changed image-based documents MUST stay private until equally complete evidence exists. */
export interface ScheduleAttachment {
 sourceArticle:string;sourcePublishedOn:string;url:string;sha256:string;documentTitle:string;version:string;
 pages:number;inspectedPages:number[];method:'text-and-rendered-pages';reviewedOn:string;
 competition:'Liga BetPlay DIMAYOR';season:'2026';phase:'II';round:number;
 timezone:{iana:'America/Bogota';offset:'-05:00';explicitInDocument:false;interpretation:'Colombia-local-time';basisUrl:string};
 fixtures:{home:string;away:string;date:string;kickoff:string;venue:string}[];
}
export const reviewedDimayorSchedule:ScheduleAttachment={
 sourceArticle:'https://dimayor.com.co/2026/10/26/cambios-en-la-programacion-de-la-fecha-17-de-la-liga-betplay-dimayor-ll-2026',sourcePublishedOn:'2026-10-26',
 url:'https://dimayor.com.co/wp-content/uploads/2026/10/CAMBIOS-17MLIGA-BETPLAY-DIMAYOR-II-2026_compressed.pdf',sha256:'295d9e680448a6ef384cf14b92f011e87f9bd727cfbb8435243d8428deb6dff3',
 documentTitle:'PROGRAMACIÓN LIGA BETPLAY DIMAYOR II-2026 (V38)',version:'V38 (PDF metadata)',pages:2,inspectedPages:[1,2],method:'text-and-rendered-pages',reviewedOn:'2026-10-28',competition:'Liga BetPlay DIMAYOR',season:'2026',phase:'II',round:17,
 timezone:{iana:'America/Bogota',offset:'-05:00',explicitInDocument:false,interpretation:'Colombia-local-time',basisUrl:'https://horalegalnueva.inm.gov.co/'},
 fixtures:[
  {home:'Deportivo Cali',away:'Boyacá Chicó',date:'2026-11-01',kickoff:'16:05',venue:'Deportivo Cali'},
  {home:'Cúcuta Deportivo',away:'Independiente Santa Fe',date:'2026-11-04',kickoff:'18:30',venue:'General Santander'},
  {home:'Millonarios',away:'América de Cali',date:'2026-11-04',kickoff:'20:30',venue:'El Campín'},
 ],
};
export function stableEvidence(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stableEvidence).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableEvidence((value as Record<string,unknown>)[k])).join(',')+'}';}
export function attachmentErrors(value:ScheduleAttachment|undefined,source:string,sourceDate:string):string[]{
 if(!value)return ['SCHEDULE_ATTACHMENT_INCOMPLETE'];
 const expected=reviewedDimayorSchedule;
 if(source!==expected.sourceArticle||sourceDate!==expected.sourcePublishedOn||stableEvidence(value)!==stableEvidence(expected))return ['SCHEDULE_ATTACHMENT_UNVERIFIED'];
 if(value.pages!==value.inspectedPages.length||value.inspectedPages.some((n,i)=>n!==i+1)||!value.fixtures.length)return ['SCHEDULE_ATTACHMENT_INCOMPLETE'];
 for(const f of value.fixtures){if(f.home===f.away||!f.venue||!/^20\d{2}-\d{2}-\d{2}$/.test(f.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.kickoff)||!Number.isFinite(Date.parse(f.date+'T'+f.kickoff+':00'+value.timezone.offset)))return ['SCHEDULE_ATTACHMENT_CONFLICT'];}
 return [];
}
export function verifiedScheduleBytes(source:string,sourceDate:string,url:string,bytes:Uint8Array):ScheduleAttachment|null{
 if(bytes.length>1500000||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-'||url!==reviewedDimayorSchedule.url)return null;
 if(createHash('sha256').update(bytes).digest('hex')!==reviewedDimayorSchedule.sha256)return null;
 const evidence=structuredClone(reviewedDimayorSchedule);return attachmentErrors(evidence,source,sourceDate).length?null:evidence;
}
export const scheduleRow=(f:ScheduleAttachment['fixtures'][number])=>`${f.home} vs ${f.away} | ${f.date} | ${f.kickoff} | ${f.venue}`;
export function scheduleCopyErrors(body:string,evidence:ScheduleAttachment,language:string){
 const errors:string[]=[];
 for(const f of evidence.fixtures)if(!body.includes(scheduleRow(f)))errors.push(`${language}:SCHEDULE_FIXTURE_INCOMPLETE_OR_MISMATCH`);
 if(!body.includes('Liga BetPlay DIMAYOR II-2026')||!new RegExp(`\\b${evidence.round}\\b`).test(body))errors.push(`${language}:SCHEDULE_COMPETITION_OR_ROUND_MISMATCH`);
 if(!body.includes('UTC-05:00')||!/interpret/i.test(body))errors.push(`${language}:SCHEDULE_TIMEZONE_INTERPRETATION_REQUIRED`);
 const dates=body.match(/\b20\d{2}-\d{2}-\d{2}\b/g)??[],times=body.replace('UTC-05:00','').match(/\b\d{2}:\d{2}\b/g)??[];
 if(dates.some(x=>!evidence.fixtures.some(f=>f.date===x))||times.some(x=>!evidence.fixtures.some(f=>f.kickoff===x)))errors.push(`${language}:UNSUPPORTED_SCHEDULE_VALUE`);
 return [...new Set(errors)];
}
/** Input omission is never evidence of real-world absence. No current contract asserts absence. */
export function unsupportedAbsenceClaim(text:string){
 const t=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return /\bno (?:further|additional|other|more)\b.{0,100}\b(?:details?|information|schedules?|fixtures?)\b|\b(?:details?|information)\b.{0,45}\b(?:not (?:provided|specified|available|announced)|unavailable)\b|\b(?:no|sin)\b.{0,35}\b(?:mas|otros|adicionales|mayores)\b.{0,45}\b(?:detalles|informacion|datos)\b|\bnao\b.{0,45}\b(?:outros|mais|adicionais)\b.{0,45}\b(?:detalhes|informacoes|dados)\b|\bsem\b.{0,25}\b(?:mais|outros)\b.{0,30}\b(?:detalhes|informacoes)\b/.test(t);
}
