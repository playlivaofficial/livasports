import {createHash} from 'node:crypto';
import {validateSnapshot,type SportsEntity,type SportsEvent,type SportsSnapshot} from './model';

export const OPENFOOTBALL_ARCHIVES=Object.freeze([
  {competitionId:'premier-league',file:'en.1.json',country:'England',maxTeams:20},
  {competitionId:'la-liga',file:'es.1.json',country:'Spain',maxTeams:20},
  {competitionId:'serie-a',file:'it.1.json',country:'Italy',maxTeams:20},
  {competitionId:'ligue-1',file:'fr.1.json',country:'France',maxTeams:18},
].map(item=>Object.freeze({...item,season:'2026/27',through:'2026-09-20',sourceUrl:`https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/${item.file}`})));
export type OpenFootballArchive=typeof OPENFOOTBALL_ARCHIVES[number];
export interface OpenFootballPreview {
  snapshot:SportsSnapshot;
  summary:{competitionId:string;season:string;mode:'historical';results:number;entities:number;tables:0;futureFixtures:0;observedThrough:string;sourceUrl:string;licenseUrl:string;sourceSha256:string|null;skippedUnscored:number;skippedOutsideAudit:number};
}
const licenseUrl='https://github.com/openfootball/football.json/blob/master/LICENSE.md';
function approvedConfig(competitionId:string){const config=OPENFOOTBALL_ARCHIVES.find(item=>item.competitionId===competitionId);if(!config)throw new Error('OPENFOOTBALL_NOT_APPROVED');return config;}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('OPENFOOTBALL_SHAPE');return value as Record<string,unknown>;}
function text(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>160||/[<>\u0000-\u001f\u007f]/.test(value))throw new Error('OPENFOOTBALL_TEXT');return value.trim();}
function dateOnly(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('OPENFOOTBALL_DATE');return value;}
function finalScore(value:unknown):[number,number]|null{
  if(value===undefined||value===null)return null;
  const score=Array.isArray(value)?value:object(value).ft;
  if(score===undefined)return null;
  if(!Array.isArray(score)||score.length!==2||!score.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100))throw new Error('OPENFOOTBALL_SCORE');
  return score as [number,number];
}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

/** Deliberately dated results-only evidence, not a table or a prediction of the current fixture schedule. */
export function normalizeOpenFootballArchive(competitionId:string,value:unknown,now=new Date(),sourceSha256:string|null=null):OpenFootballPreview{
  const config=approvedConfig(competitionId),payload=object(value);
  if(!Array.isArray(payload.matches)||payload.matches.length<1||payload.matches.length>400)throw new Error('OPENFOOTBALL_MATCH_LIMIT');
  const entities=new Map<string,SportsEntity>(),events:SportsEvent[]=[],eventIds=new Set<string>();let skippedUnscored=0,skippedOutsideAudit=0;
  const participant=(raw:unknown)=>{
    const name=text(raw),id=`openfootball-${hash(`${config.country}:${name}`).slice(0,24)}`;
    const old=entities.get(id);if(old&&old.name!==name)throw new Error('OPENFOOTBALL_ENTITY_COLLISION');
    if(!old)entities.set(id,{id,name,kind:'club',country:config.country});return id;
  };
  for(const raw of payload.matches){
    const match=object(raw),score=finalScore(match.score);
    if(!score){skippedUnscored++;continue;}
    const date=dateOnly(match.date);
    if(date<'2026-08-01'||date>config.through||date>now.toISOString().slice(0,10)){skippedOutsideAudit++;continue;}
    const homeId=participant(match.team1),awayId=participant(match.team2),round=match.round===undefined?undefined:text(match.round);
    if(homeId===awayId)throw new Error('OPENFOOTBALL_SELF_MATCH');
    const id=`openfootball-${hash(`${competitionId}:${date}:${homeId}:${awayId}`).slice(0,24)}`;
    if(eventIds.has(id))throw new Error('OPENFOOTBALL_DUPLICATE_RESULT');eventIds.add(id);
    // The source's optional local clock has no timezone. Preserve the real date and leave kickoff unknown.
    events.push({id,stage:'League',...(round?{round}:{}),homeId,awayId,start:null,date,status:'completed',scores:{home:score[0],away:score[1]}});
  }
  if(!events.length||entities.size<2||entities.size>config.maxTeams)throw new Error('OPENFOOTBALL_NO_VALID_RESULTS');
  events.sort((a,b)=>a.date!.localeCompare(b.date!)||a.id.localeCompare(b.id));
  const observedThrough=events.at(-1)!.date!;
  const snapshot:SportsSnapshot={schemaVersion:1,competitionId,sport:'football',season:config.season,stage:'League',sourceId:'openfootball',sourceUrl:config.sourceUrl,observedAt:observedThrough,retrievedAt:now.toISOString(),mode:'historical',entities:[...entities.values()].sort((a,b)=>a.id.localeCompare(b.id)),tables:[],events};
  if(validateSnapshot(snapshot,now).length)throw new Error('OPENFOOTBALL_INVALID_SNAPSHOT');
  return {snapshot,summary:{competitionId,season:config.season,mode:'historical',results:events.length,entities:entities.size,tables:0,futureFixtures:0,observedThrough,sourceUrl:config.sourceUrl,licenseUrl,sourceSha256,skippedUnscored,skippedOutsideAudit}};
}

/** A deliberate manual preview: exactly one fixed raw-file request, 1 MiB and 12 seconds, no retry. */
export async function previewOpenFootballArchive(competitionId:string,options:{fetcher?:typeof fetch;now?:Date}={}):Promise<OpenFootballPreview>{
  const config=approvedConfig(competitionId),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await (options.fetcher??fetch)(config.sourceUrl,{signal:controller.signal,redirect:'error',cache:'no-store',headers:{Accept:'application/json,text/plain','User-Agent':'LivaSports-DataCollector/3.0 (+https://livasports.com)'}});
    if(!response.ok)throw new Error(response.status===429?'OPENFOOTBALL_RATE_LIMITED':'OPENFOOTBALL_HTTP_REJECTED');
    if(!/^(?:application\/json|text\/plain)(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error('OPENFOOTBALL_CONTENT_TYPE');
    const maxBytes=1024*1024;if(Number(response.headers.get('content-length')??0)>maxBytes)throw new Error('OPENFOOTBALL_TOO_LARGE');
    if(!response.body)throw new Error('OPENFOOTBALL_EMPTY');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
    try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>maxBytes){await reader.cancel();throw new Error('OPENFOOTBALL_TOO_LARGE');}chunks.push(next.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('OPENFOOTBALL_JSON');}
    return normalizeOpenFootballArchive(competitionId,value,options.now??new Date(),createHash('sha256').update(bytes).digest('hex'));
  }catch(error){
    const code=error instanceof Error?error.message:'';
    if(/^OPENFOOTBALL_[A-Z_]+$/.test(code))throw error;
    throw new Error(controller.signal.aborted?'OPENFOOTBALL_TIMEOUT':'OPENFOOTBALL_NETWORK');
  }finally{clearTimeout(timer);}
}

/** All-or-nothing preview collection; no database import, publication, cron or background polling. */
export async function collectOpenFootballArchives(options:{fetcher?:typeof fetch;now?:Date}={}):Promise<OpenFootballPreview[]>{
  const previews:OpenFootballPreview[]=[];
  for(const config of OPENFOOTBALL_ARCHIVES)previews.push(await previewOpenFootballArchive(config.competitionId,options));
  return previews;
}
