import 'server-only';
import type {DatabaseClient,QueryExecutor} from '@/database/client';
import type {InterfaceLocale} from '@/localization/interface';
import {competitionName} from '@/sports/policy';
import type {SportsFixture,SportsTeam} from '@/sports/types';
import {FAVORITE_LIMIT,type FavoriteKind,type GuestFavorites,isUuid,publicFavoriteId,uniqueIds} from './identity';
import {dedupeMyMatches,type MyMatchRow,sortMyMatches} from './feed';

type Row=Record<string,unknown>;
const number=(v:unknown)=>v===null||v===undefined?null:Number(v);
const string=(v:unknown)=>v===null||v===undefined?null:String(v);
const iso=(v:unknown)=>v?new Date(String(v)).toISOString():null;
function team(r:Row,prefix=''):SportsTeam{return {id:String(r[`${prefix}team_id`]),publicId:String(r[`${prefix}public_id`]),name:String(r[`${prefix}name`]),imageUrl:string(r[`${prefix}image_url`])};}
const fixtureColumns=`f.id,f.public_id,f.season_id,f.kickoff,f.status,f.round_name,f.stage_name,f.home_score,f.away_score,c.slug,
  ht.id AS home_team_id,ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image_url,
  at.id AS away_team_id,at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image_url,
  CASE WHEN f.id=ANY($1::uuid[]) THEN 'match' WHEN f.home_team_id=ANY($2::uuid[]) OR f.away_team_id=ANY($2::uuid[]) THEN 'team' ELSE 'competition' END AS favorite_reason`;
const fixtureJoins=`FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)`;
function mapFixture(r:Row,locale:InterfaceLocale):SportsFixture{
  return {id:String(r.id),publicId:String(r.public_id),seasonId:string(r.season_id),competitionSlug:String(r.slug),competition:competitionName(locale,String(r.slug))??String(r.slug),kickoff:iso(r.kickoff)!,status:r.status as SportsFixture['status'],round:string(r.round_name),stage:string(r.stage_name),home:team(r,'home_'),away:team(r,'away_'),homeScore:number(r.home_score),awayScore:number(r.away_score)};
}

export interface PublicFavorites {teams:string[];competitions:string[];fixtures:string[]}
export interface FavoriteCounts {teams:number;competitions:number;fixtures:number}

const tables={team:'user_favorite_teams',competition:'user_favorite_competitions',fixture:'user_favorite_fixtures'} as const;
const idColumn={team:'team_id',competition:'competition_id',fixture:'fixture_id'} as const;

export class FavoritesRepository {
  constructor(private readonly db:QueryExecutor & Partial<Pick<DatabaseClient,'transaction'>>){}

  async resolve(kind:FavoriteKind,publicId:string):Promise<string|null> {
    const id=publicFavoriteId(kind,publicId);if(!id)return null;
    if(kind==='team')return string((await this.db.query<Row>('SELECT id FROM teams WHERE public_id=$1',[id])).rows[0]?.id);
    if(kind==='competition')return string((await this.db.query<Row>('SELECT id FROM competitions WHERE slug=$1 AND enabled',[id])).rows[0]?.id);
    return string((await this.db.query<Row>('SELECT id FROM fixtures WHERE public_id=$1 AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=fixtures.id)',[id])).rows[0]?.id);
  }

  async listPublic(userId:string):Promise<PublicFavorites> {
    if(!isUuid(userId))return {teams:[],competitions:[],fixtures:[]};
    const [teams,competitions,fixtures]=await Promise.all([
      this.db.query<Row>('SELECT t.public_id FROM user_favorite_teams f JOIN teams t ON t.id=f.team_id WHERE f.user_id=$1 ORDER BY f.created_at,t.public_id',[userId]),
      this.db.query<Row>('SELECT c.slug AS public_id FROM user_favorite_competitions f JOIN competitions c ON c.id=f.competition_id WHERE f.user_id=$1 ORDER BY f.created_at,c.slug',[userId]),
      this.db.query<Row>('SELECT fx.public_id FROM user_favorite_fixtures f JOIN fixtures fx ON fx.id=f.fixture_id WHERE f.user_id=$1 ORDER BY f.created_at,fx.public_id',[userId]),
    ]);
    return {
      teams:teams.rows.map(row=>String(row.public_id)),
      competitions:competitions.rows.map(row=>String(row.public_id)),
      fixtures:fixtures.rows.map(row=>String(row.public_id)),
    };
  }

  async counts(userId:string):Promise<FavoriteCounts> {
    if(!isUuid(userId))return {teams:0,competitions:0,fixtures:0};
    const row=(await this.db.query<Row>(`SELECT
      (SELECT count(*)::int FROM user_favorite_teams WHERE user_id=$1) AS teams,
      (SELECT count(*)::int FROM user_favorite_competitions WHERE user_id=$1) AS competitions,
      (SELECT count(*)::int FROM user_favorite_fixtures WHERE user_id=$1) AS fixtures`,[userId])).rows[0];
    return {teams:Number(row?.teams??0),competitions:Number(row?.competitions??0),fixtures:Number(row?.fixtures??0)};
  }

  async setFavorite(userId:string,kind:FavoriteKind,publicId:string,favorited:boolean):Promise<{ok:true;favorited:boolean}|{ok:false;error:'INVALID'|'NOT_FOUND'|'LIMIT'}> {
    if(!isUuid(userId))return {ok:false,error:'INVALID'};
    const entityId=await this.resolve(kind,publicId);
    if(!entityId)return favorited?{ok:false,error:'NOT_FOUND'}:{ok:true,favorited:false};
    const table=tables[kind],column=idColumn[kind];
    if(!favorited){
      await this.db.query(`DELETE FROM ${table} WHERE user_id=$1 AND ${column}=$2`,[userId,entityId]);
      return {ok:true,favorited:false};
    }
    const count=Number((await this.db.query<Row>(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`,[userId])).rows[0]?.n??0);
    const exists=Number((await this.db.query<Row>(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1 AND ${column}=$2`,[userId,entityId])).rows[0]?.n??0);
    if(!exists&&count>=FAVORITE_LIMIT)return {ok:false,error:'LIMIT'};
    await this.db.query(`INSERT INTO ${table} (user_id, ${column}) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[userId,entityId]);
    return {ok:true,favorited:true};
  }

  async mergePublic(userId:string,guest:GuestFavorites):Promise<{favorites:PublicFavorites;skipped:number}> {
    if(!isUuid(userId))return {favorites:{teams:[],competitions:[],fixtures:[]},skipped:0};
    const work=(client:QueryExecutor)=>new FavoritesRepository(client).mergeOn(userId,guest);
    return this.db.transaction?this.db.transaction(work):work(this.db);
  }

  private async mergeOn(userId:string,guest:GuestFavorites):Promise<{favorites:PublicFavorites;skipped:number}> {
    if(!isUuid(userId))return {favorites:{teams:[],competitions:[],fixtures:[]},skipped:0};
    const teams=uniqueIds(guest.teams,'team');
    const competitions=uniqueIds(guest.competitions,'competition');
    const fixtures=uniqueIds(guest.fixtures,'fixture');
    const knownTeams=teams.length?(await this.db.query<Row>('SELECT public_id FROM teams WHERE public_id=ANY($1::text[])',[teams])).rows.map(row=>String(row.public_id)):[];
    const knownCompetitions=competitions.length?(await this.db.query<Row>('SELECT slug FROM competitions WHERE slug=ANY($1::text[]) AND enabled',[competitions])).rows.map(row=>String(row.slug)):[];
    const knownFixtures=fixtures.length?(await this.db.query<Row>('SELECT public_id FROM fixtures WHERE public_id=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=fixtures.id)',[fixtures])).rows.map(row=>String(row.public_id)):[];
    if(knownTeams.length)await this.db.query(`INSERT INTO user_favorite_teams (user_id, team_id) SELECT $1, t.id FROM teams t WHERE t.public_id=ANY($2::text[]) ON CONFLICT DO NOTHING`,[userId,knownTeams]);
    if(knownCompetitions.length)await this.db.query(`INSERT INTO user_favorite_competitions (user_id, competition_id) SELECT $1, c.id FROM competitions c WHERE c.slug=ANY($2::text[]) AND c.enabled ON CONFLICT DO NOTHING`,[userId,knownCompetitions]);
    if(knownFixtures.length)await this.db.query(`INSERT INTO user_favorite_fixtures (user_id, fixture_id) SELECT $1, f.id FROM fixtures f WHERE f.public_id=ANY($2::text[]) ON CONFLICT DO NOTHING`,[userId,knownFixtures]);
    const favorites=await this.listPublic(userId);
    const skipped=(teams.length-knownTeams.length)+(competitions.length-knownCompetitions.length)+(fixtures.length-knownFixtures.length);
    return {favorites,skipped};
  }

  async feed(locale:InterfaceLocale,ids:{teams:string[];competitions:string[];fixtures:string[]}):Promise<MyMatchRow[]> {
    const teamIds=ids.teams.length?(await this.db.query<Row>('SELECT id FROM teams WHERE public_id=ANY($1::text[])',[ids.teams])).rows.map(row=>String(row.id)):[];
    const competitionIds=ids.competitions.length?(await this.db.query<Row>('SELECT id FROM competitions WHERE slug=ANY($1::text[]) AND enabled',[ids.competitions])).rows.map(row=>String(row.id)):[];
    const fixtureIds=ids.fixtures.length?(await this.db.query<Row>('SELECT id FROM fixtures WHERE public_id=ANY($1::text[])',[ids.fixtures])).rows.map(row=>String(row.id)):[];
    if(!teamIds.length&&!competitionIds.length&&!fixtureIds.length)return [];
    const rows=(await this.db.query<Row>(`SELECT ${fixtureColumns} ${fixtureJoins}
      WHERE (f.id=ANY($1::uuid[]) OR f.home_team_id=ANY($2::uuid[]) OR f.away_team_id=ANY($2::uuid[]) OR f.competition_id=ANY($3::uuid[]))
        AND c.enabled
        AND (f.status IN ('LIVE','HALFTIME') OR (f.kickoff >= now() - interval '7 days' AND f.kickoff <= now() + interval '21 days'))
      ORDER BY f.kickoff,f.id
      LIMIT 80`,[fixtureIds,teamIds,competitionIds])).rows;
    return sortMyMatches(dedupeMyMatches(rows.map(row=>({
      fixture:mapFixture(row,locale),
      reason:row.favorite_reason==='team'?'team':row.favorite_reason==='competition'?'competition':'match',
    }))));
  }

  async feedForUser(userId:string,locale:InterfaceLocale):Promise<MyMatchRow[]> {
    return this.feed(locale,await this.listPublic(userId));
  }
}
