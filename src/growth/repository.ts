import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {absoluteUrl} from '@/seo/policy';
import {matchPath} from '@/localization/interface';
import {slugifyProfileName} from '@/profiles/routes';
import {readListingOddsSnapshots} from '@/odds/read-repository';
import {quoteState} from '@/odds/comparison';
import {SHORTLIST,GROWTH_CHANNELS,type GrowthChannel} from './config';
import type {FixtureSignals} from './scoring';
import type {GrowthChannelRecord,GrowthChannelStatus,GrowthContentItem,GrowthContentPack,GrowthFixture,GrowthFixtureSnapshot} from './types';

type Row=Record<string,unknown>;
const iso=(value:unknown)=>new Date(String(value)).toISOString();
const text=(value:unknown)=>value===null||value===undefined?null:String(value);
const numeric=(value:unknown)=>value===null||value===undefined?null:Number(value);
const asJson=<T>(value:unknown):T=>typeof value==='string'?JSON.parse(value) as T:value as T;

/** One bounded, DB-only candidate read; ordinary ranking never contacts a provider. */
export async function readGrowthFixtures(db:QueryExecutor,now=new Date()):Promise<GrowthFixture[]>{
  const from=new Date(now.getTime()-SHORTLIST.graceHours*3_600_000);
  const to=new Date(now.getTime()+SHORTLIST.horizonHours*3_600_000);
  const rows=(await db.query<Row>(`SELECT f.id AS fixture_id,f.public_id,f.kickoff,f.status,f.stage_name,f.round_name,f.venue_name,
    c.slug AS competition_slug,c.display_name_pt_br AS competition_name,c.competition_type,s.name AS season_name,
    ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image_url,
    at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image_url,
    (SELECT sc.position FROM standings_current sc WHERE sc.season_id=f.season_id AND sc.team_id=f.home_team_id ORDER BY sc.observed_at DESC,sc.stage_id DESC LIMIT 1) AS home_position,
    (SELECT sc.position FROM standings_current sc WHERE sc.season_id=f.season_id AND sc.team_id=f.away_team_id ORDER BY sc.observed_at DESC,sc.stage_id DESC LIMIT 1) AS away_position,
    (SELECT count(DISTINCT sc.team_id)::int FROM standings_current sc WHERE sc.season_id=f.season_id) AS total_teams
    FROM fixtures f JOIN competitions c ON c.id=f.competition_id
    LEFT JOIN seasons s ON s.id=f.season_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
    WHERE c.enabled AND f.kickoff BETWEEN $1 AND $2
      AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)
    ORDER BY f.kickoff,f.public_id LIMIT 500`,[from,to])).rows;
  const fixtureIds=rows.map(row=>String(row.fixture_id));
  const snapshots=fixtureIds.length?await readListingOddsSnapshots(db,fixtureIds,'BR',true):new Map();
  return rows.map(row=>{
    const id=String(row.fixture_id),snapshot=snapshots.get(id);
    const active=new Map<string,string>();
    if(snapshot)for(const quote of snapshot.quotes){
      if(quote.geoEligible&&quoteState(quote,snapshot,now.getTime())==='ACTIVE')active.set(quote.bookmaker,quote.bookmakerName);
    }
    const bookmakers=[...active].sort(([a],[b])=>a.localeCompare(b)).map(([slug,name])=>({slug,name}));
    const count=bookmakers.length;
    const standingsTotal=numeric(row.total_teams),homePosition=numeric(row.home_position),awayPosition=numeric(row.away_position);
    const standings=standingsTotal&&standingsTotal>0?{homePosition,awayPosition,totalTeams:standingsTotal}:null;
    const homeName=String(row.home_name),awayName=String(row.away_name),publicId=String(row.public_id);
    const signals:FixtureSignals={fixtureId:id,publicId,kickoff:iso(row.kickoff),status:String(row.status),
      competitionSlug:String(row.competition_slug),competitionName:String(row.competition_name),competitionType:String(row.competition_type),seasonName:text(row.season_name),
      home:{slug:slugifyProfileName(homeName),name:homeName,publicId:String(row.home_public_id),imageUrl:text(row.home_image_url)},
      away:{slug:slugifyProfileName(awayName),name:awayName,publicId:String(row.away_public_id),imageUrl:text(row.away_image_url)},
      stageName:text(row.stage_name),roundName:text(row.round_name),venue:text(row.venue_name),standings,oddsBookmakers:count};
    const destinationPath=matchPath('br',publicId,homeName,awayName);
    return {signals,destinationPath,destinationUrl:absoluteUrl(destinationPath),odds:{bookmakers,count,
      label:count?`${count} ${count===1?'casa com odds atuais':'casas com odds atuais'}`:'Sem odds atuais'}};
  });
}
export async function recentGrowthFixtureIds(db:QueryExecutor,now=new Date()):Promise<Set<string>>{
  const since=new Date(now.getTime()-SHORTLIST.duplicateWindowDays*86_400_000);
  const rows=(await db.query<{fixture_id:string}>('SELECT DISTINCT fixture_id FROM growth_content_items WHERE created_at>=$1',[since])).rows;
  return new Set(rows.map(row=>String(row.fixture_id)));
}

export function canTransitionGrowthStatus(from:GrowthChannelStatus,to:GrowthChannelStatus):boolean{
  if(from==='PUBLISHED')return false;
  if(to==='PUBLISHED')return from==='APPROVED';
  if(to==='APPROVED')return from==='DRAFT'||from==='REJECTED';
  if(to==='REJECTED')return from==='DRAFT'||from==='APPROVED';
  return false;
}

export async function transitionGrowthChannel(db:DatabaseClient,itemId:string,channel:GrowthChannel,to:GrowthChannelStatus,now=new Date()):Promise<boolean>{
  return db.transaction(async tx=>{
    const current=(await tx.query<{status:GrowthChannelStatus}>(`SELECT status FROM growth_content_channels
      WHERE content_item_id=$1 AND channel=$2 FOR UPDATE`,[itemId,channel])).rows[0];
    if(!current||!canTransitionGrowthStatus(current.status,to))return false;
    await tx.query(`UPDATE growth_content_channels SET status=$3,updated_at=$4,
      approved_at=CASE WHEN $3='APPROVED' THEN $4 ELSE approved_at END,
      rejected_at=CASE WHEN $3='REJECTED' THEN $4 ELSE rejected_at END,
      published_at=CASE WHEN $3='PUBLISHED' THEN $4 ELSE published_at END
      WHERE content_item_id=$1 AND channel=$2`,[itemId,channel,to,now]);
    return true;
  });
}

interface PersistInput {
  fixtureId:string;sourceHash:string;trigger:'AUTOMATIC'|'OWNER';priorityScore:number;
  scoreBreakdown:unknown;reasons:string[];fixture:GrowthFixtureSnapshot;content:GrowthContentPack;
  canonicalUrl:string;tracking:Record<GrowthChannel,string>;now:Date;force:boolean;
}
/** Advisory locking makes the seven-day duplicate check and revision increment atomic per fixture. */
export async function persistGrowthItem(db:DatabaseClient,input:PersistInput):Promise<{id:string;revision:number}|null>{
  return db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`growth:${input.fixtureId}`]);
    if(!input.force){
      const since=new Date(input.now.getTime()-SHORTLIST.duplicateWindowDays*86_400_000);
      const duplicate=(await tx.query('SELECT 1 FROM growth_content_items WHERE fixture_id=$1 AND created_at>=$2 LIMIT 1',[input.fixtureId,since])).rowCount;
      if(duplicate)return null;
    }
    const revision=Number((await tx.query<{revision:number}>('SELECT COALESCE(max(revision),0)+1 AS revision FROM growth_content_items WHERE fixture_id=$1',[input.fixtureId])).rows[0]?.revision??1);
    const item=(await tx.query<{id:string}>(`INSERT INTO growth_content_items(fixture_id,revision,generator_version,source_hash,trigger_source,
      priority_score,score_breakdown,ranking_reasons,fixture_snapshot,content_pack,canonical_url,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12) RETURNING id`,[
      input.fixtureId,revision,input.content.generatorVersion,input.sourceHash,input.trigger,input.priorityScore,JSON.stringify(input.scoreBreakdown),
      JSON.stringify(input.reasons),JSON.stringify(input.fixture),JSON.stringify(input.content),input.canonicalUrl,input.now])).rows[0];
    for(const channel of GROWTH_CHANNELS)await tx.query(`INSERT INTO growth_content_channels(content_item_id,channel,tracked_url,updated_at)
      VALUES($1,$2,$3,$4)`,[item.id,channel,input.tracking[channel],input.now]);
    return {id:item.id,revision};
  });
}

export async function acquireGrowthJob(db:DatabaseClient,trigger:'AUTOMATIC'|'OWNER',now=new Date()):Promise<string|null>{
  try{return await db.transaction(async tx=>{
    await tx.query(`UPDATE growth_generation_jobs SET status='FAILED',completed_at=$1,error_code='LEASE_EXPIRED'
      WHERE status='RUNNING' AND lease_expires_at<$1`,[now]);
    const row=(await tx.query<{id:string}>(`INSERT INTO growth_generation_jobs(status,trigger_source,lease_expires_at,heartbeat_at,started_at)
      VALUES('RUNNING',$1,$2,$3,$3) RETURNING id`,[trigger,new Date(now.getTime()+120_000),now])).rows[0];
    return row.id;
  });}catch(error){return (error as {code?:string}).code==='23505'?null:Promise.reject(error);}
}

export async function finishGrowthJob(db:QueryExecutor,id:string,state:'SUCCEEDED'|'PARTIAL'|'FAILED',result:{considered:number;generated:number;skippedDuplicate:number;error?:string},now=new Date()){
  await db.query(`UPDATE growth_generation_jobs SET status=$2,considered=$3,generated=$4,skipped_duplicate=$5,
    result=$6::jsonb,error_code=$7,completed_at=$8,heartbeat_at=$8 WHERE id=$1`,[id,state,result.considered,result.generated,result.skippedDuplicate,
    JSON.stringify(result),result.error??null,now]);
}

function hydrateItem(row:Row):GrowthContentItem{
  const channels=asJson<Array<Record<string,unknown>>>(row.channels??[]).map((channel):GrowthChannelRecord=>({
    channel:String(channel.channel) as GrowthChannel,status:String(channel.status) as GrowthChannelStatus,trackedUrl:String(channel.tracked_url),
    approvedAt:channel.approved_at?iso(channel.approved_at):null,rejectedAt:channel.rejected_at?iso(channel.rejected_at):null,
    publishedAt:channel.published_at?iso(channel.published_at):null,
  }));
  return {id:String(row.id),fixtureId:String(row.fixture_id),revision:Number(row.revision),sourceHash:String(row.source_hash),
    trigger:String(row.trigger_source) as GrowthContentItem['trigger'],priorityScore:Number(row.priority_score),
    scoreBreakdown:asJson(row.score_breakdown),reasons:asJson(row.ranking_reasons),canonicalUrl:String(row.canonical_url),
    fixture:asJson(row.fixture_snapshot),content:asJson(row.content_pack),channels,createdAt:iso(row.created_at)};
}

const itemSelect=`SELECT i.*,COALESCE(jsonb_agg(jsonb_build_object('channel',ch.channel,'status',ch.status,'tracked_url',ch.tracked_url,
  'approved_at',ch.approved_at,'rejected_at',ch.rejected_at,'published_at',ch.published_at) ORDER BY ch.channel)
  FILTER(WHERE ch.channel IS NOT NULL),'[]'::jsonb) AS channels
  FROM growth_content_items i LEFT JOIN growth_content_channels ch ON ch.content_item_id=i.id`;

export async function readLatestGrowthItems(db:QueryExecutor,limit=100):Promise<GrowthContentItem[]>{
  const rows=(await db.query<Row>(`${itemSelect} GROUP BY i.id ORDER BY i.created_at DESC,i.id DESC LIMIT $1`,[limit])).rows;
  return rows.map(hydrateItem);
}

export async function readGrowthItem(db:QueryExecutor,id:string):Promise<GrowthContentItem|null>{
  const row=(await db.query<Row>(`${itemSelect} WHERE i.id=$1 GROUP BY i.id`,[id])).rows[0];
  return row?hydrateItem(row):null;
}
