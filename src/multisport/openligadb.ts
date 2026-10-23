import {validateSnapshot,type FootballRow,type SportsEvent,type SportsSnapshot} from './model';

export const OPENLIGA_CONFIG=Object.freeze({sourceKey:'openligadb:bl1:2026',competitionId:'bundesliga',league:'bl1',upstreamSeason:2026,season:'2026/27',teams:18,matches:306,from:'2026-08-01T00:00:00Z',until:'2027-06-02T00:00:00Z'});
export const OPENLIGA_URLS=Object.freeze({table:'https://api.openligadb.de/getbltable/bl1/2026',matches:'https://api.openligadb.de/getmatchdata/bl1/2026'});
type JsonObject=Record<string,unknown>;
function object(value:unknown):JsonObject{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('UPSTREAM_SHAPE');return value as JsonObject;}
function integer(value:unknown,min=0,max=100000):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error('UPSTREAM_NUMBER');return value;}
function name(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>160||/[<>\u0000-\u001f]/.test(value))throw new Error('UPSTREAM_TEXT');return value.trim();}
function utc(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('UPSTREAM_DATE');const date=new Date(value);if(date.toISOString().slice(0,19)!==value.slice(0,19))throw new Error('UPSTREAM_DATE');return date.toISOString();}
const teamId=(value:unknown)=>`openligadb-team-${integer(value,1)}`;
export function openLigaSeasonActive(now:Date){return now.getTime()>=Date.parse(OPENLIGA_CONFIG.from)&&now.getTime()<Date.parse(OPENLIGA_CONFIG.until);}
/** Source marker is compared opaquely: unzoned German local timestamps are NOT relabelled UTC. */
export function openLigaVersion(value:unknown):string{if(typeof value!=='string'||value.length>64||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)?$/.test(value))throw new Error('UPSTREAM_VERSION');return value;}

/** Validate source completeness AND reconcile all table totals against finished fixtures. */
export function assertOpenLigaSnapshot(snapshot:SportsSnapshot,now=new Date()):void{
  if(!openLigaSeasonActive(now)||snapshot.sourceId!=='openligadb'||snapshot.competitionId!=='bundesliga'||snapshot.season!==OPENLIGA_CONFIG.season||snapshot.sport!=='football'||snapshot.mode!=='automatic'||snapshot.sourceUrl!==OPENLIGA_URLS.table)throw new Error('SOURCE_NOT_APPROVED');
  if(validateSnapshot(snapshot,now).length)throw new Error('INVALID_SNAPSHOT');
  const table=snapshot.tables[0];
  if(snapshot.tables.length!==1||table.type!=='football'||table.rows.length!==18||snapshot.entities.length!==18||snapshot.events.length!==306)throw new Error('UPSTREAM_INCOMPLETE');
  const rows=new Map(table.rows.map(row=>[row.entityId,row]));
  const computed=new Map(table.rows.map(row=>[row.entityId,{played:0,won:0,drawn:0,lost:0,goalsFor:0,goalsAgainst:0,goalDifference:0,points:0}]));
  const pairs=new Set<string>();let latestCompleted=0;
  for(const event of snapshot.events){
    const pair=`${event.homeId}:${event.awayId}`;
    if(pairs.has(pair)||!rows.has(event.homeId)||!rows.has(event.awayId))throw new Error('UPSTREAM_FIXTURE_CONFLICT');pairs.add(pair);
    if(event.status!=='completed')continue;
    if(!event.scores||!event.start)throw new Error('UPSTREAM_RESULT_MISSING');
    latestCompleted=Math.max(latestCompleted,Date.parse(event.start));
    const home=computed.get(event.homeId)!,away=computed.get(event.awayId)!;
    home.played++;away.played++;home.goalsFor+=event.scores.home;home.goalsAgainst+=event.scores.away;away.goalsFor+=event.scores.away;away.goalsAgainst+=event.scores.home;
    if(event.scores.home>event.scores.away){home.won++;away.lost++;}else if(event.scores.home<event.scores.away){away.won++;home.lost++;}else{home.drawn++;away.drawn++;}
  }
  if(!latestCompleted||Date.parse(snapshot.observedAt)!==latestCompleted)throw new Error('UPSTREAM_OBSERVATION_CONFLICT');
  for(const [id,total] of computed){
    total.points=3*total.won+total.drawn;total.goalDifference=total.goalsFor-total.goalsAgainst;
    const row=rows.get(id)!;
    if(row.pointsAdjustment)throw new Error('UNVERIFIED_POINTS_ADJUSTMENT');
    for(const field of Object.keys(total) as (keyof typeof total)[])if(row[field]!==total[field])throw new Error('UPSTREAM_TABLE_CONFLICT');
  }
  for(let index=0;index<table.rows.length;index++){
    const row=table.rows[index],previous=table.rows[index-1];
    if(row.rank!==index+1)throw new Error('UPSTREAM_RANK_CONFLICT');
    if(previous&&(previous.points<row.points||(previous.points===row.points&&previous.goalDifference<row.goalDifference)||(previous.points===row.points&&previous.goalDifference===row.goalDifference&&previous.goalsFor<row.goalsFor)))throw new Error('UPSTREAM_RANK_CONFLICT');
  }
}

export function normalizeOpenLigaSnapshot(tableValue:unknown,matchesValue:unknown,now=new Date()):SportsSnapshot{
  if(!Array.isArray(tableValue)||tableValue.length!==18||!Array.isArray(matchesValue)||matchesValue.length!==306)throw new Error('UPSTREAM_INCOMPLETE');
  const entities=new Map<string,{id:string;name:string;kind:'club'}>();
  const rows:FootballRow[]=tableValue.map((value,index)=>{
    const row=object(value),id=teamId(row.teamInfoId),teamName=name(row.teamName);
    if(entities.has(id))throw new Error('UPSTREAM_DUPLICATE_TEAM');entities.set(id,{id,name:teamName,kind:'club'});
    return {entityId:id,rank:index+1,played:integer(row.matches,0,34),won:integer(row.won,0,34),drawn:integer(row.draw,0,34),lost:integer(row.lost,0,34),goalsFor:integer(row.goals,0,1000),goalsAgainst:integer(row.opponentGoals,0,1000),goalDifference:integer(row.goalDiff,-1000,1000),points:integer(row.points,-100,102)};
  });
  let latestCompleted=0;
  const events:SportsEvent[]=matchesValue.map(value=>{
    const match=object(value),home=object(match.team1),away=object(match.team2),homeId=teamId(home.teamId),awayId=teamId(away.teamId);
    if(entities.get(homeId)?.name!==name(home.teamName)||entities.get(awayId)?.name!==name(away.teamName))throw new Error('UPSTREAM_TEAM_CONFLICT');
    if(typeof match.matchIsFinished!=='boolean')throw new Error('UPSTREAM_SHAPE');
    const start=utc(match.matchDateTimeUTC);let scores:SportsEvent['scores']=null;
    if(match.matchIsFinished){
      if(!Array.isArray(match.matchResults))throw new Error('UPSTREAM_RESULT_MISSING');
      const finals=match.matchResults.map(object).filter(result=>result.resultTypeID===2);
      if(finals.length!==1)throw new Error('UPSTREAM_RESULT_MISSING');
      scores={home:integer(finals[0].pointsTeam1,0,100),away:integer(finals[0].pointsTeam2,0,100)};
      latestCompleted=Math.max(latestCompleted,Date.parse(start));
    }
    return {id:`openligadb-match-${integer(match.matchID,1,1000000000)}`,stage:'League',round:name(object(match.group).groupName),homeId,awayId,start,status:match.matchIsFinished?'completed':'scheduled',scores};
  });
  if(!latestCompleted)throw new Error('UPSTREAM_NO_COMPLETED_RESULTS');
  const snapshot:SportsSnapshot={schemaVersion:1,competitionId:'bundesliga',sport:'football',season:OPENLIGA_CONFIG.season,stage:'League',sourceId:'openligadb',sourceUrl:OPENLIGA_URLS.table,observedAt:new Date(latestCompleted).toISOString(),retrievedAt:now.toISOString(),mode:'automatic',entities:[...entities.values()],tables:[{type:'football',id:'overall',name:'Bundesliga',stage:'League',rows}],events};
  assertOpenLigaSnapshot(snapshot,now);return snapshot;
}

export class OpenLigaHttpError extends Error {constructor(readonly code:string,readonly httpStatus?:number){super(code);}}
/** Fixed URL allowlist, streaming size bound, timeout and zero retries. Never downloads graphics. */
export async function fetchOpenLigaJson(url:string,fetcher:typeof fetch=fetch):Promise<unknown>{
  if(!(Object.values(OPENLIGA_URLS) as readonly string[]).includes(url))throw new OpenLigaHttpError('SOURCE_NOT_APPROVED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetcher(url,{signal:controller.signal,redirect:'error',cache:'no-store',headers:{Accept:'application/json','User-Agent':'LivaSports-DataCollector/3.0 (+https://livasports.com)'}});
    if(!response.ok)throw new OpenLigaHttpError(response.status===429?'UPSTREAM_RATE_LIMITED':response.status>=500?'UPSTREAM_UNAVAILABLE':'UPSTREAM_HTTP_REJECTED',response.status);
    if(!/\bapplication\/json\b/i.test(response.headers.get('content-type')??''))throw new OpenLigaHttpError('UPSTREAM_CONTENT_TYPE');
    const maxBytes=2*1024*1024,declared=Number(response.headers.get('content-length')??0);
    if(declared>maxBytes)throw new OpenLigaHttpError('UPSTREAM_TOO_LARGE');
    if(!response.body)throw new OpenLigaHttpError('UPSTREAM_EMPTY');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
    try{while(true){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>maxBytes){await reader.cancel();throw new OpenLigaHttpError('UPSTREAM_TOO_LARGE');}chunks.push(next.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new OpenLigaHttpError('UPSTREAM_INVALID_JSON');}
  }catch(error){if(error instanceof OpenLigaHttpError)throw error;throw new OpenLigaHttpError(controller.signal.aborted?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK');}finally{clearTimeout(timer);}
}
