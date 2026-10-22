import {createHash} from 'node:crypto';
import type {NewsCompetition,NewsSport} from '../taxonomy';
import type {DiscoveryCandidate} from '../discovery';

/** These are factual contracts, not blanket permission to publish arbitrary feed text.
 * Only a source-specific extractor with corroborating primary evidence can create one.
 * Quotes, photographs, article prose and comprehensive proprietary datasets are excluded. */
export type AnnouncementDetail=
 | {type:'qualification';participant:string;stage:'semi-final';season:string}
 | {type:'league-announcement';authority:string;action:string;subject:string}
 | {type:'competition-decision';authority:string;decision:string;effectiveOn:string}
 | {type:'fixture-announcement';participants:[string,string];stage:string;action:'referee-appointments';referee:string}
 | {type:'draw';stage:string;pairings:[string,string][]}
 | {type:'schedule-change';participants:[string,string];previousStart:string;newStart:string;timezone:string}
 | {type:'ranking';rankingName:string;effectiveOn:string;entries:{name:string;rank:number}[]}
 | {type:'roster-announcement';season:string;scope:'opening-night';internationalPlayers:number;countries:number;continents:number}
 | {type:'award';recipient:string;award:string;period:string};
export interface AnnouncementFacts {
 kind:'announcement';eventKey:string;sourceId:'nba-releases'|'dimayor-releases'|'nfl-cardinals';sourceUrl:string;
 sourceName:string;eventDate:string;observedAt:string;competition:NewsCompetition;sport:NewsSport;
 country:'international'|'co';detail:AnnouncementDetail;
 provenance:{method:'primary-feed-facts-v1';headlineCorroborated:true;bodyCorroborated:true;factsHash:string;rights:'independent-facts-only'};
}
/** Fixed field order survives PostgreSQL jsonb normalization; never hash insertion order. */
const hash=(value:AnnouncementDetail)=>{
 const normalized=value.type==='roster-announcement'?{type:value.type,season:value.season,scope:value.scope,internationalPlayers:value.internationalPlayers,countries:value.countries,continents:value.continents}
  :value.type==='fixture-announcement'?{type:value.type,participants:value.participants,stage:value.stage,action:value.action,referee:value.referee}
  :value.type==='qualification'?{type:value.type,participant:value.participant,stage:value.stage,season:value.season}
  :value.type==='award'?{type:value.type,recipient:value.recipient,award:value.award,period:value.period}:value;
 return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};
export const announcementKey=(url:string)=>`citation:${createHash('sha256').update(url).digest('hex')}`;
export function announcementErrors(f:AnnouncementFacts,now=new Date()):string[]{
 const errors:string[]=[];
 let url:URL;try{url=new URL(f.sourceUrl);}catch{return ['INVALID_PROVENANCE'];}
 if(url.protocol!=='https:'||url.search||url.hash||url.username||url.password||f.eventKey!==announcementKey(f.sourceUrl))errors.push('INVALID_PROVENANCE');
 const p=f.provenance;
 if(p?.method!=='primary-feed-facts-v1'||p.rights!=='independent-facts-only'||p.headlineCorroborated!==true||p.bodyCorroborated!==true||p.factsHash!==hash(f.detail))errors.push('UNVERIFIED_FACTS');
 const date=Date.parse(f.eventDate),observed=Date.parse(f.observedAt);
 if(!Number.isFinite(date)||!Number.isFinite(observed)||date>observed||observed>+now||+now-date>7*86400000)errors.push('STALE_OR_INVALID_DATE');
 // Unimplemented contracts fail closed: registering a type is not operational coverage.
 if(f.sourceId==='nba-releases'&&url.hostname==='pr.nba.com'&&f.competition==='nba'&&f.sport==='basketball'&&f.country==='international'&&f.sourceName==='NBA Communications'&&f.detail.type==='roster-announcement'){
  const d=f.detail;
  if(!/^20\d{2}-\d{2}$/.test(d.season)||Number(d.season.slice(-2))!==(Number(d.season.slice(0,4))+1)%100||d.scope!=='opening-night'||![d.internationalPlayers,d.countries,d.continents].every(Number.isSafeInteger)||d.internationalPlayers<1||d.internationalPlayers>600||d.countries<1||d.countries>d.internationalPlayers||d.continents<1||d.continents>7)errors.push('CONTRADICTORY_ROSTER_FACTS');
 }else if(f.sourceId==='dimayor-releases'&&url.hostname==='dimayor.com.co'&&f.competition==='copa-colombia'&&f.sport==='football'&&f.country==='co'&&f.sourceName==='DIMAYOR'&&f.detail.type==='fixture-announcement'){
  const d=f.detail;
  if(d.action!=='referee-appointments'||d.stage!=='quarter-final'||d.participants.length!==2||d.participants[0]===d.participants[1]||[...d.participants,d.referee].some(s=>!s||s.length>80||/[<>\d{}\r\n]/.test(s)))errors.push('CONTRADICTORY_FIXTURE_FACTS');
 }else if(f.sourceId==='dimayor-releases'&&url.hostname==='dimayor.com.co'&&f.competition==='copa-colombia'&&f.sport==='football'&&f.country==='co'&&f.sourceName==='DIMAYOR'&&f.detail.type==='qualification'){
  const d=f.detail;
  if(d.stage!=='semi-final'||!/^20\d{2}$/.test(d.season)||d.season!==f.eventDate.slice(0,4)||!d.participant||d.participant.length>80||/[<>\d{}\r\n]/.test(d.participant))errors.push('CONTRADICTORY_QUALIFICATION_FACTS');
 }else if(f.sourceId==='nfl-cardinals'&&url.hostname==='azcardinals.com'&&url.pathname.startsWith('/news/')&&f.competition==='nfl'&&f.sport==='american-football'&&f.country==='international'&&f.sourceName==='Arizona Cardinals'&&f.detail.type==='award'){
  const d=f.detail;
  if(!/^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}$/.test(d.recipient)||d.award!=='NFC Special Teams Player of the Week'||d.period!=='weekly')errors.push('CONTRADICTORY_AWARD_FACTS');
 }else errors.push('ANNOUNCEMENT_TYPE_REQUIRES_SOURCE_ADAPTER');
 return errors;
}
/** Receives approved RSS or source-specific article text transiently. Never returns prose.
 * Headline and body must independently establish the same facts. Unknown shapes remain metadata. */
export function extractAnnouncement(candidate:DiscoveryCandidate,body:string,now=new Date()):AnnouncementFacts|null{
 if(!candidate.sourceDate||body.length>50000)return null;
 let detail:AnnouncementDetail|undefined;
 if(candidate.desk==='nfl-cardinals'){
  const headline=/^([A-Z][a-z]+(?: [A-Z][a-z]+){1,3}) Named NFC Special Teams Player Of The Week(?: After [A-Za-z ]+)?$/.exec(candidate.headline);
  if(headline){
   const surname=headline[1].split(' ').at(-1)!;
   const corroboration=`NFC Special Teams Player of the Week, which the NFL bestowed upon ${surname} on `;
   if(body.includes(headline[1])&&body.includes(corroboration)&&!new RegExp(`(?:not|never) (?:named|awarded|bestowed)`, 'i').test(body))detail={type:'award',recipient:headline[1],award:'NFC Special Teams Player of the Week',period:'weekly'};
  }
 }else if(candidate.desk==='nba-releases'){
  const h=/NBA rosters feature (\d+) international players from (?:record-tying )?(\d+) countries across (\w+) continents/i.exec(candidate.headline);
  const b=/(\d+) international players from (?:a record-tying )?(\d+) countries across (\w+) continents are on opening-night rosters for the (20\d{2}-\d{2}) season/i.exec(body);
  const numbers:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7};
  if(h&&b&&h[1]===b[1]&&h[2]===b[2]&&h[3].toLowerCase()===b[3].toLowerCase())detail={type:'roster-announcement',season:b[4],scope:'opening-night',internationalPlayers:Number(b[1]),countries:Number(b[2]),continents:numbers[b[3].toLowerCase()]??Number(b[3])};
 }else if(candidate.desk==='dimayor-releases'){
  // Qualification only: do not infer score, opponent, venue or a played-match date.
  // Require the same team, round and edition in separate headline/body assertions.
  const qualification=/^(.+?) clasificado a las Semifinales de la Copa BetPlay DIMAYOR (20\d{2})$/i.exec(candidate.headline);
  const confirmation=/^(.+?) consiguió su clasificación a las semifinales de la Copa BetPlay DIMAYOR (20\d{2})(?:,|\.)/i.exec(body);
  if(qualification&&confirmation&&qualification[1]===confirmation[1]&&qualification[2]===confirmation[2])detail={type:'qualification',participant:qualification[1],stage:'semi-final',season:qualification[2]};
  const h=/^Designaciones arbitrales (.+?) vs\. (.+?) Copa BetPlay DIMAYOR 20\d{2}$/i.exec(candidate.headline);
  const referee=/(?:^|\s)Árbitro\s+([\p{L} .'-]+?)\s+(?:Tolima|Caldas|Antioquia|Atlántico|Bogotá|Valle|Santander)(?:\s|$)/u.exec(body);
  if(h&&referee&&/Copa BetPlay DIMAYOR/i.test(body)&&/Cuartos de Final/i.test(body)&&body.toLocaleLowerCase().includes(`${h[1]} vs. ${h[2]}`.toLocaleLowerCase()))detail={type:'fixture-announcement',participants:[h[1],h[2]],stage:'quarter-final',action:'referee-appointments',referee:referee[1].trim()};
 }
 if(!detail)return null;
 const nba=candidate.desk==='nba-releases';
 if(candidate.desk==='nfl-cardinals'){
  const facts:AnnouncementFacts={kind:'announcement',eventKey:announcementKey(candidate.url),sourceId:'nfl-cardinals',sourceUrl:candidate.url,sourceName:'Arizona Cardinals',eventDate:candidate.sourceDate+'T00:00:00Z',observedAt:now.toISOString(),competition:'nfl',sport:'american-football',country:'international',detail,provenance:{method:'primary-feed-facts-v1',headlineCorroborated:true,bodyCorroborated:true,factsHash:hash(detail),rights:'independent-facts-only'}};
  return announcementErrors(facts,now).length?null:facts;
 }
 const facts:AnnouncementFacts={kind:'announcement',eventKey:announcementKey(candidate.url),sourceId:nba?'nba-releases':'dimayor-releases',sourceUrl:candidate.url,sourceName:nba?'NBA Communications':'DIMAYOR',eventDate:candidate.sourceDate+'T00:00:00Z',observedAt:now.toISOString(),competition:nba?'nba':'copa-colombia',sport:nba?'basketball':'football',country:nba?'international':'co',detail,provenance:{method:'primary-feed-facts-v1',headlineCorroborated:true,bodyCorroborated:true,factsHash:hash(detail),rights:'independent-facts-only'}};
 return announcementErrors(facts,now).length?null:facts;
}
export function announcementCopyErrors(copy:Record<'en'|'es'|'pt',{title:string;summary:string;body:string}>,facts:AnnouncementFacts){
 const errors:string[]=[],numbers=new Set(JSON.stringify(facts.detail).match(/\d+/g)??[]);
 const entities=facts.detail.type==='fixture-announcement'?[...facts.detail.participants,facts.detail.referee]:facts.detail.type==='qualification'?[facts.detail.participant]:facts.detail.type==='award'?[facts.detail.recipient]:['NBA'];
 for(const lang of ['en','es','pt'] as const){
  const part=copy?.[lang];
  if(!part||Object.keys(part).sort().join(',')!=='body,summary,title'||Object.values(part).some(v=>typeof v!=='string')){errors.push(`${lang}:INVALID_COPY`);continue;}
  const text=[part.title,part.summary,part.body].join(' ');
  if(part.body.length<40||part.body.length>1800||/[<>]|https?:|["“”]|\b(?:bet|odds|apuesta|cuota|aposte|exclusive|exclusiv\w*)\b/i.test(text))errors.push(`${lang}:UNSUPPORTED_CLAIM_OR_FORMAT`);
  if(!part.body.includes(facts.sourceName)||entities.some(e=>!part.body.includes(e)))errors.push(`${lang}:MISSING_SOURCE_OR_ENTITY`);
  if((text.match(/\d+/g)??[]).some(n=>!numbers.has(n)))errors.push(`${lang}:UNSUPPORTED_NUMBER`);
 }
 if(copy?.en?.body===copy?.es?.body||copy?.en?.body===copy?.pt?.body||copy?.es?.body===copy?.pt?.body)errors.push('TRANSLATION_NOT_DISTINCT');
 return errors;
}
