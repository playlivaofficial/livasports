import type {DatabaseClient,QueryExecutor} from '@/database/client';
import {mapSportmonksFixtureStatus} from '@/providers/sportmonks/normalizer';
import {sportmonksUtc} from '@/providers/sportmonks/utc';
import {fixtureCoachSources,fixtureFormationSources,fixtureLineupSources} from './source-integrity';

export type ProviderRow=Record<string,unknown>;
export const records=(v:unknown):ProviderRow[]=>Array.isArray(v)?v.filter((r):r is ProviderRow=>!!r&&typeof r==='object'):[];
export const object=(v:unknown):ProviderRow=>v&&typeof v==='object'&&!Array.isArray(v)?v as ProviderRow:{};
const text=(v:unknown):string|null=>typeof v==='string'&&v.trim()?v.trim():null;
const numeric=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const bounded=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max?v:null;
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const distinct=(rows:ProviderRow[],key:string)=>[...new Map(rows.map(r=>[String(r[key]),r])).values()];
const sport='4b6ca767-90b1-4275-ad70-fc25c40f8352';

// These schemas are internal constants. SQL identifiers never come from provider input.
const tables={
  seasons:['id uuid,competition_id uuid,name text,starts_at timestamptz,ends_at timestamptz,is_current boolean','id'],
  teams:['id uuid,sport_id uuid,country_id uuid,name text,short_name text,image_url text,team_type text,founded_year integer,venue_name text,venue_city text,provider_placeholder boolean','id'],
  players:['id uuid,sport_id uuid,name text,display_name text,common_name text,firstname text,lastname text,image_url text,country_name text,nationality_name text,position_id integer,position_name text,detailed_position_id integer,detailed_position_name text,date_of_birth date,height_cm integer,weight_kg integer,gender text','id'],
  fixtures:['id uuid,public_id text,sport_id uuid,competition_id uuid,season_id uuid,home_team_id uuid,away_team_id uuid,kickoff timestamptz,status text,home_score integer,away_score integer,season_name text,provider_round_id bigint,round_name text,provider_stage_id bigint,stage_name text,provider_group_id bigint,group_name text,venue_name text,venue_city text,provider_updated_at timestamptz','id'],
  sports_pending_fixtures:['id uuid,public_id text,provider_fixture_id bigint,season_id uuid,competition_id uuid,kickoff timestamptz,round_name text,stage_name text,home_name text,away_name text','id'],
  fixture_scores:['fixture_id uuid,provider_score_id bigint,participant_id uuid,description text,goals integer','fixture_id,provider_score_id'],
  fixture_events:['fixture_id uuid,provider_event_id bigint,provider_type_id integer,event_type text,period_id integer,detailed_period_id integer,minute integer,extra_minute integer,team_id uuid,player_id bigint,player_name text,related_player_id bigint,related_player_name text,result text,detail text,sort_order integer,rescinded boolean,player_entity_id uuid,related_player_entity_id uuid','fixture_id,provider_event_id'],
  fixture_statistics:['fixture_id uuid,provider_statistic_id bigint,provider_type_id integer,statistic_type text,team_id uuid,location text,value_numeric numeric,value_text text,unit text','fixture_id,provider_statistic_id'],
  fixture_lineups:['fixture_id uuid,provider_lineup_id bigint,team_id uuid,provider_player_id bigint,player_name text,lineup_type text,position_id integer,formation_field text,formation_position integer,jersey_number integer,player_entity_id uuid,unlinked_statistics jsonb','fixture_id,provider_lineup_id'],
  fixture_formations:['fixture_id uuid,team_id uuid,formation text','fixture_id,team_id'],
  fixture_coaches:['fixture_id uuid,team_id uuid,provider_coach_id bigint,coach_name text','fixture_id,team_id'],
  standings_current:['season_id uuid,stage_id bigint,group_id bigint,team_id uuid,provider_standing_id bigint,competition_id uuid,stage_name text,group_name text,position integer,played integer,won integer,drawn integer,lost integer,goals_for integer,goals_against integer,goal_difference integer,points integer,provider_rule jsonb,provider_form jsonb,provider_details jsonb','season_id,stage_id,group_id,team_id'],
  season_topscorers:['season_id uuid,provider_record_id bigint,player_id uuid,team_id uuid,provider_type_id integer,position integer,total numeric','season_id,provider_record_id'],
  sports_unlinked_competition_records:['season_id uuid,capability text,provider_record_id bigint,provider_participant_id bigint,provider_player_id bigint,team_id uuid,player_id uuid,payload jsonb,reason text','season_id,capability,provider_record_id'],
  team_squad_memberships:['team_id uuid,season_id uuid,player_id uuid,provider_squad_id bigint,position_id integer,position_name text,detailed_position_id integer,jersey_number integer,starts_at date,ends_at date','team_id,season_id,player_id'],
  profile_statistic_types:['provider text,provider_type_id integer,name text,developer_name text,model_type text,stat_group text,value_shape jsonb','provider,provider_type_id'],
  player_season_statistics:['player_id uuid,team_id uuid,season_id uuid,competition_id uuid,provider_statistic_id bigint,provider_type_id integer,value jsonb','player_id,team_id,season_id,provider_type_id'],
  team_season_statistics:['team_id uuid,season_id uuid,competition_id uuid,provider_statistic_id bigint,provider_type_id integer,value jsonb','team_id,season_id,provider_type_id'],
  fixture_player_statistics:['fixture_id uuid,player_id uuid,team_id uuid,provider_statistic_id bigint,provider_type_id integer,value jsonb','fixture_id,player_id,provider_type_id'],
} as const;
async function upsert(db:QueryExecutor,table:keyof typeof tables,rows:ProviderRow[],preserveNull=false){
  if(!rows.length)return;
  const [schema,key]=tables[table],keys=key.split(',');
  const columns=schema.split(',').map(c=>c.split(' ')[0]);
  const unique=[...new Map(rows.map(r=>[keys.map(k=>r[k]).join(':'),r])).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,r])=>r);
  const sets=columns.filter(c=>!keys.includes(c)&&c!=='public_id').map(c=>`${c}=${preserveNull?`COALESCE(EXCLUDED.${c},${table}.${c})`:`EXCLUDED.${c}`}`);
  if(['teams','players','fixtures','seasons','profile_statistic_types'].includes(table))sets.push('updated_at=now()');
  else sets.push('observed_at=now()');
  // Match-level player details are large. Bound each JSONB recordset so the database never materializes a whole fixture page at once.
  for(let offset=0;offset<unique.length;offset+=500)await db.query(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_to_recordset($1::jsonb) AS x(${schema}) ON CONFLICT(${key}) DO UPDATE SET ${sets.join(',')}`,[JSON.stringify(unique.slice(offset,offset+500))]);
}
export interface SeasonContext {id:string;competitionId:string;league:string;providerId:number;name:string;}
const isPending=(r:ProviderRow)=>{const participants=records(r.participants);return r.placeholder===true||!r.starting_at||participants.length!==2||participants[0].id===participants[1].id;};

/** Idempotent, bounded bulk writes into the existing sports read models. */
export class SportsIngestionStore {
  constructor(private readonly db:DatabaseClient){}
  private async mapping(db:QueryExecutor,type:'TEAM'|'SEASON'|'FIXTURE',ids:unknown[]):Promise<Map<string,string>>{
    const valid=[...new Set(ids.filter(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0).map(String))].sort();
    if(!valid.length)return new Map();
    const rows=await db.query<{provider_entity_id:string;livasports_entity_id:string}>(`INSERT INTO provider_entity_mappings(provider,entity_type,provider_entity_id,livasports_entity_id)
      SELECT 'SPORTMONKS',$1,v,gen_random_uuid() FROM unnest($2::text[]) v ON CONFLICT(provider,entity_type,provider_entity_id) DO UPDATE SET updated_at=provider_entity_mappings.updated_at RETURNING provider_entity_id,livasports_entity_id`,[type,valid]);
    return new Map(rows.rows.map(r=>[r.provider_entity_id,r.livasports_entity_id]));
  }
  async seasons(competitionId:string,league:string,rows:ProviderRow[]):Promise<SeasonContext[]>{
    if(rows.some(r=>String(r.league_id)!==league))throw new Error('Season mapping mismatch');
    return this.db.transaction(async db=>{
      const map=await this.mapping(db,'SEASON',rows.map(r=>r.id));
      // The complete provider season catalogue is supplied; never clear other seasons to ingest one history page.
      await upsert(db,'seasons',rows.map(r=>({id:map.get(String(r.id)),competition_id:competitionId,name:r.name,starts_at:date(r.starting_at),ends_at:date(r.ending_at),is_current:r.is_current===true})));
      return rows.map(r=>({id:map.get(String(r.id))!,competitionId,league,providerId:Number(r.id),name:String(r.name)}));
    });
  }
  private async teams(db:QueryExecutor,season:SeasonContext,rows:ProviderRow[]){
    const unique=distinct(rows.filter(r=>r.id&&text(r.name)),'id');
    const map=await this.mapping(db,'TEAM',unique.map(r=>r.id));
    const countries=distinct(unique.map(r=>object(r.country)).filter(c=>typeof c.iso2==='string'&&/^[a-z]{2}$/i.test(c.iso2)&&text(c.name)).map(c=>({iso2:String(c.iso2).toUpperCase(),name:c.name})),'iso2');
    const countryMap=new Map<string,string>();
    if(countries.length){const result=await db.query<{id:string;iso2:string}>(`INSERT INTO countries(iso2,name) SELECT iso2,name FROM jsonb_to_recordset($1::jsonb) x(iso2 text,name text) ON CONFLICT(iso2) DO UPDATE SET name=countries.name RETURNING id,iso2`,[JSON.stringify(countries)]);for(const c of result.rows)countryMap.set(c.iso2,c.id);}
    await upsert(db,'teams',unique.map(r=>({id:map.get(String(r.id)),sport_id:sport,country_id:countryMap.get(String(object(r.country).iso2).toUpperCase()),name:r.name,short_name:text(r.short_code),image_url:text(r.image_path),team_type:'CLUB',founded_year:bounded(r.founded,1800,2100),venue_name:text(object(r.venue).name),venue_city:text(object(r.venue).city_name),provider_placeholder:r.placeholder===true})),true);
    if(map.size)await db.query('INSERT INTO team_seasons(team_id,season_id) SELECT unnest($1::uuid[]),$2 ON CONFLICT DO NOTHING',[[...map.values()],season.id]);
    return map;
  }
  async teamCatalogue(season:SeasonContext,rows:ProviderRow[]){return this.db.transaction(async db=>{
    const map=await this.teams(db,season,rows);
    const stats=rows.flatMap(r=>records(r.statistics).filter(s=>Number(s.season_id)===season.providerId).flatMap(s=>records(s.details).map(d=>({...d,team:map.get(String(r.id))}))));
    await this.statistics(db,'team_season_statistics',stats.map(r=>({...r,context:{team_id:r.team,season_id:season.id,competition_id:season.competitionId}})));
    return map.size;
  });}
  private async players(db:QueryExecutor,rows:ProviderRow[]):Promise<Map<string,string>>{
    const unique=distinct(rows.filter(r=>r.id&&(text(r.display_name)||text(r.name)||text(r.common_name))),'id');
    if(!unique.length)return new Map();
    // Concurrent seasons and the live ticker can discover the same player. Reserve identity before either creates it.
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('sports-player:' || v,0)) FROM (SELECT unnest($1::text[]) v ORDER BY 1) ordered`,[unique.map(r=>String(r.id))]);
    const prior=await db.query<{provider_player_id:string;player_id:string}>('SELECT provider_player_id,player_id FROM player_provider_mappings WHERE provider=\'SPORTMONKS\' AND provider_player_id=ANY($1::text[])',[unique.map(r=>String(r.id))]);
    const map=new Map(prior.rows.map(r=>[r.provider_player_id,r.player_id]));
    for(const r of unique)if(!map.has(String(r.id)))map.set(String(r.id),crypto.randomUUID());
    await upsert(db,'players',unique.map(r=>({id:map.get(String(r.id)),sport_id:sport,name:text(r.name)||text(r.display_name)||text(r.common_name),display_name:text(r.display_name)||text(r.name)||text(r.common_name),common_name:text(r.common_name),firstname:text(r.firstname),lastname:text(r.lastname),image_url:text(r.image_path),country_name:text(object(r.country).name),nationality_name:text(object(r.nationality).name),position_id:numeric(r.position_id),position_name:text(object(r.position).name),detailed_position_id:numeric(r.detailed_position_id),detailed_position_name:text(object(r.detailedPosition).name),date_of_birth:date(r.date_of_birth),height_cm:bounded(r.height,100,250),weight_kg:bounded(r.weight,30,250),gender:text(r.gender)})),true);
    if(map.size)await db.query(`INSERT INTO player_provider_mappings(provider,provider_player_id,player_id) SELECT 'SPORTMONKS',k,v FROM unnest($1::text[],$2::uuid[]) x(k,v) ON CONFLICT(provider,provider_player_id) DO NOTHING`,[[...map.keys()],[...map.values()]]);
    return map;
  }
  private async statistics(db:QueryExecutor,table:'player_season_statistics'|'team_season_statistics'|'fixture_player_statistics',rows:ProviderRow[]){
    const valid=rows.filter(r=>r.type_id&&Object.keys(object(r.value??r.data)).length&&text(object(r.type).name));
    await upsert(db,'profile_statistic_types',valid.map(r=>({provider:'SPORTMONKS',provider_type_id:r.type_id,name:object(r.type).name,developer_name:object(r.type).developer_name,model_type:object(r.type).model_type,stat_group:object(r.type).stat_group,value_shape:Object.keys(object(r.value??r.data)).sort()})));
    await upsert(db,table,valid.map(r=>({...object(r.context),provider_statistic_id:r.id??r.type_id,provider_type_id:r.type_id,value:r.value??r.data})));
  }
  async squad(season:SeasonContext,teamProviderId:number,rows:ProviderRow[]){
    if(rows.some(r=>Number(r.team_id)!==teamProviderId||(r.season_id&&Number(r.season_id)!==season.providerId)))throw new Error('Squad context mismatch');
    return this.db.transaction(async db=>{
      const team=(await this.mapping(db,'TEAM',[teamProviderId])).get(String(teamProviderId))!;
      const map=await this.players(db,rows.map(r=>object(r.player)));
      await upsert(db,'team_squad_memberships',rows.filter(r=>map.has(String(r.player_id))).map(r=>({team_id:team,season_id:season.id,player_id:map.get(String(r.player_id)),provider_squad_id:r.id,position_id:r.position_id,position_name:object(r.position).name,detailed_position_id:r.detailed_position_id,jersey_number:r.jersey_number,starts_at:date(r.start),ends_at:date(r.end)})));
      const statistics=rows.filter(r=>map.has(String(r.player_id))).flatMap(r=>records(r.details).map(d=>({...d,context:{player_id:map.get(String(r.player_id)),team_id:team,season_id:season.id,competition_id:season.competitionId}})));
      await this.statistics(db,'player_season_statistics',statistics);
      return {players:map.size,statistics:statistics.length};
    });
  }
  async standings(season:SeasonContext,rows:ProviderRow[]){
    if(rows.some(r=>Number(r.season_id)!==season.providerId||String(r.league_id)!==season.league))throw new Error('Standings context mismatch');
    return this.db.transaction(async db=>{
      const teams=await this.teams(db,season,rows.map(r=>object(r.participant)));
      await this.existingTeams(db,rows.map(r=>r.participant_id),teams);
      const total=rows.length;
      await this.unlinkedCompetitionRecords(db,season,'STANDINGS',rows,teams,new Map());
      rows=rows.filter(r=>teams.has(String(r.participant_id)));
      const metric=(r:ProviderRow,id:number)=>{const v=records(r.details).find(d=>d.type_id===id)?.value;return typeof v==='string'&&v.trim()&&Number.isFinite(Number(v))?Number(v):numeric(v);};
      await db.query('DELETE FROM standings_current WHERE season_id=$1',[season.id]);
      await upsert(db,'standings_current',rows.map(r=>{const gf=metric(r,133),ga=metric(r,134);return {season_id:season.id,competition_id:season.competitionId,stage_id:r.stage_id??0,group_id:r.group_id??0,team_id:teams.get(String(r.participant_id)),provider_standing_id:r.id,stage_name:object(r.stage).name,group_name:object(r.group).name,position:r.position,played:metric(r,129),won:metric(r,130),drawn:metric(r,131),lost:metric(r,132),goals_for:gf,goals_against:ga,goal_difference:gf!==null&&ga!==null?gf-ga:null,points:r.points,provider_rule:r.rule??null,provider_form:r.form??null,provider_details:r.details??null};}));
      return total;
    });
  }
  async scorers(season:SeasonContext,rows:ProviderRow[]){
    if(rows.some(r=>Number(r.season_id)!==season.providerId))throw new Error('Scorer context mismatch');
    return this.db.transaction(async db=>{
      const teams=await this.teams(db,season,rows.map(r=>object(r.participant)));
      const players=await this.players(db,rows.map(r=>object(r.player)));
      await this.existingTeams(db,rows.map(r=>r.participant_id),teams);
      const missingPlayerIds=rows.filter(r=>!players.has(String(r.player_id))).map(r=>String(r.player_id)).filter(id=>/^[1-9][0-9]*$/.test(id));
      if(missingPlayerIds.length){const existing=await db.query<{provider_player_id:string;player_id:string}>(`SELECT pm.provider_player_id,pm.player_id FROM player_provider_mappings pm JOIN players p ON p.id=pm.player_id WHERE pm.provider='SPORTMONKS' AND pm.provider_player_id=ANY($1::text[])`,[missingPlayerIds]);for(const p of existing.rows)players.set(p.provider_player_id,p.player_id);}
      const total=rows.length;
      await this.unlinkedCompetitionRecords(db,season,'SCORERS',rows,teams,players);
      rows=rows.filter(r=>teams.has(String(r.participant_id))&&players.has(String(r.player_id)));
      await db.query('DELETE FROM season_topscorers WHERE season_id=$1',[season.id]);
      await upsert(db,'season_topscorers',rows.map(r=>({season_id:season.id,provider_record_id:r.id,player_id:players.get(String(r.player_id)),team_id:teams.get(String(r.participant_id)),provider_type_id:r.type_id,position:r.position,total:r.total})));
      return total;
    });
  }
  private async existingTeams(db:QueryExecutor,ids:unknown[],map:Map<string,string>){
    const missing=[...new Set(ids.map(String).filter(id=>/^[1-9][0-9]*$/.test(id)&&!map.has(id)))];
    if(!missing.length)return;
    const existing=await db.query<{provider_entity_id:string;livasports_entity_id:string}>(`SELECT m.provider_entity_id,m.livasports_entity_id FROM provider_entity_mappings m JOIN teams t ON t.id=m.livasports_entity_id WHERE m.provider='SPORTMONKS' AND m.entity_type='TEAM' AND m.provider_entity_id=ANY($1::text[])`,[missing]);
    for(const team of existing.rows)map.set(team.provider_entity_id,team.livasports_entity_id);
  }
  private async unlinkedCompetitionRecords(db:QueryExecutor,season:SeasonContext,capability:'STANDINGS'|'SCORERS',rows:ProviderRow[],teams:Map<string,string>,players:Map<string,string>){
    const unlinked=rows.filter(r=>!teams.has(String(r.participant_id))||(capability==='SCORERS'&&!players.has(String(r.player_id))));
    await db.query('DELETE FROM sports_unlinked_competition_records WHERE season_id=$1 AND capability=$2',[season.id,capability]);
    await upsert(db,'sports_unlinked_competition_records',unlinked.map(r=>{const team=teams.get(String(r.participant_id)),player=players.get(String(r.player_id)),missingPlayer=capability==='SCORERS'&&!player;return {season_id:season.id,capability,provider_record_id:r.id,provider_participant_id:r.participant_id,provider_player_id:r.player_id,team_id:team,player_id:player,payload:r,reason:!team?(missingPlayer?'TEAM_AND_PLAYER_NOT_EXPANDED':'TEAM_NOT_EXPANDED'):'PLAYER_NOT_EXPANDED'};}));
  }
  private async pending(db:QueryExecutor,season:SeasonContext,rows:ProviderRow[]){
    const map=await this.mapping(db,'FIXTURE',rows.map(r=>r.id));
    await upsert(db,'sports_pending_fixtures',rows.map(r=>{const id=map.get(String(r.id))!;return {id,public_id:id.replaceAll('-','').slice(0,16),provider_fixture_id:r.id,season_id:season.id,competition_id:season.competitionId,kickoff:r.starting_at?sportmonksUtc(String(r.starting_at)).toISOString():null,round_name:object(r.round).name,stage_name:object(r.stage).name,home_name:records(r.participants).find(p=>object(p.meta).location==='home')?.name,away_name:records(r.participants).find(p=>object(p.meta).location==='away')?.name};}));
    if(map.size)await db.query('UPDATE sports_pending_fixtures p SET public_id=f.public_id FROM fixtures f WHERE f.id=p.id AND p.id=ANY($1::uuid[])',[[...map.values()]]);
  }
  /** Enrich earlier checkpoints without overwriting scores or live snapshot timestamps from a cached response. */
  async fixtureMetadata(season:SeasonContext,rows:ProviderRow[]){
    if(rows.some(r=>Number(r.season_id)!==season.providerId||String(r.league_id)!==season.league))throw Error('Fixture metadata context mismatch');
    return this.db.transaction(async db=>{
      const teams=await this.teams(db,season,rows.flatMap(r=>records(r.participants)));
      await this.pending(db,season,rows.filter(isPending));
      const fixtures=(await db.query<{provider_entity_id:string;livasports_entity_id:string}>(`SELECT m.provider_entity_id,m.livasports_entity_id FROM provider_entity_mappings m JOIN fixtures f ON f.id=m.livasports_entity_id WHERE m.provider='SPORTMONKS' AND m.entity_type='FIXTURE' AND m.provider_entity_id=ANY($1::text[])`,[rows.filter(r=>!isPending(r)).map(r=>String(r.id))])).rows;
      const map=new Map(fixtures.map(r=>[r.provider_entity_id,r.livasports_entity_id]));
      await upsert(db,'fixture_coaches',rows.filter(r=>map.has(String(r.id))).flatMap(r=>fixtureCoachSources(r).accepted.filter(c=>teams.has(String(c.participant_id??object(c.meta).participant_id))&&(object(c.coach).name||c.name)).map(c=>({fixture_id:map.get(String(r.id)),team_id:teams.get(String(c.participant_id??object(c.meta).participant_id)),provider_coach_id:c.coach_id??c.id,coach_name:object(c.coach).common_name??object(c.coach).name??c.name}))));
    });
  }
  async fixtures(season:SeasonContext,rows:ProviderRow[]){
    if(rows.some(r=>Number(r.season_id)!==season.providerId||String(r.league_id)!==season.league))throw new Error('Fixture context mismatch');
    return this.db.transaction(async db=>{
      const allRows=rows;
      const pending=rows.filter(isPending);
      await this.pending(db,season,pending);
      rows=rows.filter(r=>!pending.includes(r));
      const teams=await this.teams(db,season,rows.flatMap(r=>records(r.participants)));
      const fixtures=await this.mapping(db,'FIXTURE',rows.map(r=>r.id));
      const identities=rows.flatMap(r=>[...records(r.lineups).map(p=>({...object(p.player),id:p.player_id,name:p.player_name})),...records(r.events).flatMap(e=>[{id:e.player_id,name:e.player_name},{id:e.related_player_id,name:e.related_player_name}])]);
      const players=await this.players(db,identities);
      const scores=(r:ProviderRow,team:unknown)=>numeric(object(records(r.scores).find(s=>s.participant_id===team&&s.description==='CURRENT')?.score).goals);
      await upsert(db,'fixtures',rows.map(r=>{
        const home=records(r.participants).find(p=>object(p.meta).location==='home'),away=records(r.participants).find(p=>object(p.meta).location==='away');
        if(!home||!away||home.id===away.id)throw new Error('Fixture lacks explicit distinct participants');
        const id=fixtures.get(String(r.id))!;
        return {id,public_id:id.replaceAll('-','').slice(0,16),sport_id:sport,competition_id:season.competitionId,season_id:season.id,home_team_id:teams.get(String(home.id)),away_team_id:teams.get(String(away.id)),kickoff:sportmonksUtc(String(r.starting_at),numeric(r.starting_at_timestamp)??undefined).toISOString(),status:mapSportmonksFixtureStatus(String(object(r.state).developer_name??object(r.state).name??r.state_id)),home_score:scores(r,home.id),away_score:scores(r,away.id),season_name:season.name,provider_round_id:r.round_id??object(r.round).id,round_name:object(r.round).name,provider_stage_id:r.stage_id??object(r.stage).id,stage_name:object(r.stage).name,provider_group_id:r.group_id??object(r.group).id,group_name:object(r.group).name,venue_name:object(r.venue).name,venue_city:object(r.venue).city_name,provider_updated_at:r.updated_at? sportmonksUtc(String(r.updated_at)).toISOString():null};
      }));
      if(rows.length)await db.query('DELETE FROM sports_pending_fixtures WHERE provider_fixture_id=ANY($1::bigint[])',[rows.map(r=>r.id)]);
      const batches:Partial<Record<keyof typeof tables,ProviderRow[]>>={};
      // An included array is a complete provider snapshot, including genuine removals (for example a corrected event).
      // Omitted includes leave previously verified details intact.
      const snapshots=[['scores','fixture_scores'],['events','fixture_events'],['statistics','fixture_statistics'],['lineups','fixture_lineups'],['lineups','fixture_player_statistics'],['formations','fixture_formations'],['coaches','fixture_coaches']] as const;
      for(const [include,table] of snapshots){const ids=rows.filter(r=>Array.isArray(r[include])).map(r=>fixtures.get(String(r.id))!);
        if(ids.length)await db.query(`DELETE FROM ${table} WHERE fixture_id=ANY($1::uuid[])`,[ids]);
      }
      const collect=(table:keyof typeof tables,items:ProviderRow[])=>{(batches[table]??=[]).push(...items);};
      const playerStatistics:ProviderRow[]=[];
      for(const r of rows){
        const fixture_id=fixtures.get(String(r.id));
        const tid=(v:unknown)=>teams.get(String(v))??null,pid=(v:unknown)=>players.get(String(v))??null;
        collect('fixture_scores',records(r.scores).filter(s=>s.id&&tid(s.participant_id)&&s.description).map(s=>({fixture_id,provider_score_id:s.id,participant_id:tid(s.participant_id),description:s.description,goals:object(s.score).goals})));
        collect('fixture_events',records(r.events).map(e=>({fixture_id,provider_event_id:e.id,provider_type_id:e.type_id,event_type:object(e.type).name??object(e.type).developer_name??'UNKNOWN',period_id:e.period_id,detailed_period_id:e.detailed_period_id,minute:e.minute,extra_minute:e.extra_minute,team_id:tid(e.participant_id),player_id:e.player_id,player_name:e.player_name,related_player_id:e.related_player_id,related_player_name:e.related_player_name,result:e.result,detail:e.info??e.addition,sort_order:e.sort_order,rescinded:e.rescinded===true,player_entity_id:pid(e.player_id),related_player_entity_id:pid(e.related_player_id)})));
        collect('fixture_statistics',records(r.statistics).map(s=>({fixture_id,provider_statistic_id:s.id,provider_type_id:s.type_id,statistic_type:object(s.type).name??object(s.type).developer_name??'UNKNOWN',team_id:tid(s.participant_id),location:s.location,value_numeric:numeric(object(s.data).value),value_text:text(object(s.data).value),unit:/possession/i.test(String(object(s.type).name))?'%':null})));
        const lineups=fixtureLineupSources(r).accepted;
        collect('fixture_lineups',lineups.filter(l=>tid(l.team_id)&&text(l.player_name)).map(l=>({fixture_id,provider_lineup_id:l.id,team_id:tid(l.team_id),provider_player_id:l.player_id,player_name:l.player_name,lineup_type:l.type_id===11?'STARTER':l.type_id===12?'SUBSTITUTE':'UNKNOWN',position_id:l.position_id,formation_field:l.formation_field,formation_position:l.formation_position,jersey_number:l.jersey_number,player_entity_id:pid(l.player_id),unlinked_statistics:pid(l.player_id)?null:records(l.details)})));
        collect('fixture_formations',fixtureFormationSources(r).accepted.filter(f=>tid(f.participant_id)).map(f=>({fixture_id,team_id:tid(f.participant_id),formation:f.formation})));
        collect('fixture_coaches',fixtureCoachSources(r).accepted.filter(c=>tid(c.participant_id??object(c.meta).participant_id)&&(object(c.coach).name||c.name)).map(c=>({fixture_id,team_id:tid(c.participant_id??object(c.meta).participant_id),provider_coach_id:c.coach_id??c.id,coach_name:object(c.coach).common_name??object(c.coach).name??c.name})));
        playerStatistics.push(...lineups.filter(l=>pid(l.player_id)&&tid(l.team_id)).flatMap(l=>records(l.details).map(d=>({...d,context:{fixture_id,player_id:pid(l.player_id),team_id:tid(l.team_id)}}))));
      }
      for(const [table,items] of Object.entries(batches))await upsert(db,table as keyof typeof tables,items);
      await this.statistics(db,'fixture_player_statistics',playerStatistics);
      const states=rows.flatMap(r=>['HEADER','SCORES','EVENTS','STATISTICS','LINEUPS'].map(module=>({fixture_id:fixtures.get(String(r.id)),module,state:module==='HEADER'||records(r[module.toLowerCase()]).length?'AVAILABLE':object(r.state).developer_name==='NS'?'NOT_YET_AVAILABLE':'NO_DATA_IN_WINDOW'})));
      await db.query(`INSERT INTO fixture_detail_sync_state(fixture_id,module,state,last_attempt_at,last_success_at,snapshot_at) SELECT fixture_id,module,state,now(),now(),now() FROM jsonb_to_recordset($1::jsonb) x(fixture_id uuid,module text,state text) ON CONFLICT(fixture_id,module) DO UPDATE SET state=EXCLUDED.state,last_attempt_at=now(),last_success_at=now(),snapshot_at=now(),error_message=NULL`,[JSON.stringify(states)]);
      return allRows.length;
    });
  }
  async coverage(season:SeasonContext,capability:string,http:number,providerCount:number,persistedCount:number,complete=true,details:Record<string,unknown>={}){
    const status=!complete?'INCOMPLETE':http!==200?'UNAVAILABLE':providerCount?'AVAILABLE':'EMPTY';
    await this.db.query(`INSERT INTO sports_season_coverage(season_id,capability,status,provider_count,persisted_count,http_status,details) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(season_id,capability) DO UPDATE SET status=EXCLUDED.status,provider_count=EXCLUDED.provider_count,persisted_count=EXCLUDED.persisted_count,http_status=EXCLUDED.http_status,details=EXCLUDED.details,checked_at=now()`,[season.id,capability,status,providerCount,persistedCount,http,JSON.stringify(details)]);
  }
}
