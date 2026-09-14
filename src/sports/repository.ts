import 'server-only';
import {standingExtras} from './standing-policy';
import {unlinkedStanding,unlinkedScorers} from './unlinked-competition';
import type {QueryExecutor} from '@/database/client';
import type {InterfaceLocale} from '@/localization/interface';
import {interfaceDictionary} from '@/localization/interface';
import {localDateKey} from '@/delivery/time';
import {competitionName,numericStatistic,sportsPageSize} from './policy';
import type {CompetitionHub,PendingSportsFixture,SportsFixture,SportsSearchResult,SportsStanding,SportsTeam} from './types';

type Row=Record<string,unknown>;
const number=(v:unknown)=>v===null||v===undefined?null:Number(v);
const string=(v:unknown)=>v===null||v===undefined?null:String(v);
const iso=(v:unknown)=>v?new Date(String(v)).toISOString():null;
function team(r:Row,prefix=''):SportsTeam{return {id:String(r[`${prefix}team_id`]),publicId:String(r[`${prefix}public_id`]),name:String(r[`${prefix}name`]),imageUrl:string(r[`${prefix}image_url`])};}
const fixtureColumns=`f.id,f.public_id,f.season_id,f.kickoff,f.status,f.round_name,f.stage_name,f.home_score,f.away_score,c.slug,
  ht.id AS home_team_id,ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image_url,
  at.id AS away_team_id,at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image_url`;
const fixtureJoins=`FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)`;
function pendingFixture(r:Row):PendingSportsFixture{return {publicId:String(r.public_id),kickoff:iso(r.kickoff),round:string(r.round_name),stage:string(r.stage_name),competitionSlug:String(r.slug),seasonId:String(r.season_id),season:String(r.season_name),home:string(r.home_name),away:string(r.away_name)};}
function fixture(r:Row,locale:InterfaceLocale):SportsFixture{return {id:String(r.id),publicId:String(r.public_id),seasonId:string(r.season_id),competitionSlug:String(r.slug),competition:competitionName(locale,String(r.slug))??String(r.slug),kickoff:iso(r.kickoff)!,status:r.status as SportsFixture['status'],round:string(r.round_name),stage:string(r.stage_name),home:team(r,'home_'),away:team(r,'away_'),homeScore:number(r.home_score),awayScore:number(r.away_score)};}

/** Reads canonical stored sports facts only. No provider adapters or commercial configuration. */
export class SportsRepository {
  constructor(private readonly db:QueryExecutor){}
  async redCards(ids:readonly string[]):Promise<Record<string,{home:number|null;away:number|null}>>{
    if(!ids.length)return {};
    // The source's REDCARDS aggregate already includes second-yellow dismissals in observed fixtures; do not add both totals.
    const rows=(await this.db.query<Row>(`SELECT fixture_id,location,
      COALESCE(max(value_numeric) FILTER(WHERE provider_type_id=83),max(value_numeric) FILTER(WHERE provider_type_id=85)) AS cards
      FROM fixture_statistics WHERE fixture_id=ANY($1::uuid[]) AND period_scope='MATCH' AND provider_type_id IN (83,85)
      GROUP BY fixture_id,location`,[ids])).rows;
    const result:Record<string,{home:number|null;away:number|null}>={};
    for(const r of rows){const count=number(r.cards);if((r.location!=='home'&&r.location!=='away')||count===null||!Number.isInteger(count)||count<0)continue;
      const row=result[String(r.fixture_id)]??={home:null,away:null};row[r.location]=count;
    }
    return result;
  }
  async calendar(locale:InterfaceLocale,timeZone=interfaceDictionary(locale).timeZone){
    const today=localDateKey(new Date(),timeZone);
    const row=(await this.db.query<Row>(`SELECT min(f.kickoff) AS first,max(f.kickoff) AS last FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE c.enabled`)).rows[0];
    const first=row?.first?localDateKey(new Date(String(row.first)),timeZone):today,last=row?.last?localDateKey(new Date(String(row.last)),timeZone):today;
    return {from:first<today?first:today,to:last>today?last:today};
  }
  async competition(slug:string,locale:InterfaceLocale,requestedSeason:string|undefined,page=1):Promise<CompetitionHub|null>{
    const row=(await this.db.query<Row>(`SELECT c.id,c.slug,c.competition_type,c.coverage_status,co.name AS country FROM competitions c LEFT JOIN countries co ON co.id=c.country_id WHERE c.slug=$1 AND c.enabled`,[slug])).rows[0];
    if(!row)return null;
    const seasonRows=(await this.db.query<Row>(`SELECT s.id,s.name,s.is_current,(count(f.id)+(SELECT count(*) FROM sports_pending_fixtures p WHERE p.season_id=s.id))::int AS fixtures,
      (SELECT count(*)=6 AND bool_and(status='EMPTY' AND provider_count=0 AND persisted_count=0) FROM sports_season_coverage WHERE season_id=s.id) AS verified_empty
      FROM seasons s LEFT JOIN fixtures f ON f.season_id=s.id AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id) WHERE s.competition_id=$1 GROUP BY s.id ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST,s.name DESC`,[row.id])).rows;
    const seasons=seasonRows.map(s=>({id:String(s.id),name:String(s.name),current:Boolean(s.is_current),fixtures:Number(s.fixtures)}));
    const latestPublished=!requestedSeason&&seasons[0]?.fixtures===0&&seasonRows[0]?.verified_empty===true?seasons.find(s=>s.fixtures>0):undefined;
    const season=(requestedSeason?seasons.find(s=>s.id===requestedSeason):latestPublished??seasons[0])??null;
    const base:CompetitionHub={id:String(row.id),slug,name:competitionName(locale,slug)??slug,country:string(row.country),type:String(row.competition_type),coverage:String(row.coverage_status),seasons,season,seasonFallback:latestPublished?seasons[0]:null,upcoming:[],results:[],standings:[],scorers:[],teams:[],availability:{},pending:[],pendingTotal:0,counts:{upcoming:0,results:0},page,pageSize:sportsPageSize,providerRequests:0};
    if(!season)return base;
    const values=[row.id,season.id];
    const [counts,upcoming,results,standingRows,scorerRows,teamRows,coverageRows,pendingRows,unlinkedRows]=await Promise.all([
      this.db.query<Row>(`SELECT count(*) FILTER(WHERE status IN ('SCHEDULED','LIVE','HALFTIME','POSTPONED'))::int AS upcoming,count(*) FILTER(WHERE status='FINISHED')::int AS results FROM fixtures f WHERE competition_id=$1 AND season_id=$2 AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)`,values),
      this.db.query<Row>(`SELECT ${fixtureColumns} ${fixtureJoins} WHERE f.competition_id=$1 AND f.season_id=$2 AND f.status IN ('SCHEDULED','LIVE','HALFTIME','POSTPONED') ORDER BY CASE WHEN f.status IN ('LIVE','HALFTIME') THEN 0 ELSE 1 END,f.kickoff,f.id LIMIT $3 OFFSET $4`,[...values,sportsPageSize,(page-1)*sportsPageSize]),
      this.db.query<Row>(`SELECT ${fixtureColumns} ${fixtureJoins} WHERE f.competition_id=$1 AND f.season_id=$2 AND f.status='FINISHED' ORDER BY f.kickoff DESC,f.id LIMIT $3 OFFSET $4`,[...values,sportsPageSize,(page-1)*sportsPageSize]),
      this.db.query<Row>(`SELECT sc.*,t.public_id,t.name,t.image_url FROM standings_current sc JOIN teams t ON t.id=sc.team_id WHERE sc.competition_id=$1 AND sc.season_id=$2 ORDER BY sc.stage_id,sc.group_id,sc.position,t.name`,values),
      this.db.query<Row>(`SELECT p.public_id AS player_public_id,p.display_name,t.id AS team_id,t.public_id,t.name,t.image_url,
        COALESCE(stats.metrics,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('GOALS',CASE WHEN tops.goals IS NOT NULL THEN jsonb_build_object('total',tops.goals) END,'ASSISTS',CASE WHEN tops.assists IS NOT NULL THEN jsonb_build_object('total',tops.assists) END)) AS metrics
        FROM (SELECT ps.player_id,ps.team_id,jsonb_object_agg(st.developer_name,ps.value) AS metrics FROM player_season_statistics ps JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ps.provider_type_id
          WHERE ps.competition_id=$1 AND ps.season_id=$2 AND st.developer_name IN ('GOALS','ASSISTS','APPEARANCES','MINUTES_PLAYED') GROUP BY ps.player_id,ps.team_id) stats
        FULL JOIN (SELECT player_id,team_id,max(total) FILTER(WHERE provider_type_id=208) AS goals,max(total) FILTER(WHERE provider_type_id=209) AS assists FROM season_topscorers WHERE season_id=$2 GROUP BY player_id,team_id) tops ON tops.player_id=stats.player_id AND tops.team_id=stats.team_id
        JOIN players p ON p.id=COALESCE(stats.player_id,tops.player_id) JOIN teams t ON t.id=COALESCE(stats.team_id,tops.team_id)
        WHERE COALESCE(tops.goals,CASE WHEN stats.metrics->'GOALS'->>'total' ~ '^[0-9]+([.][0-9]+)?$' THEN (stats.metrics->'GOALS'->>'total')::numeric END)>0
        ORDER BY p.display_name`,values),
      this.db.query<Row>(`SELECT DISTINCT t.id AS team_id,t.public_id,t.name,t.image_url FROM teams t JOIN (SELECT team_id FROM team_seasons WHERE season_id=$2 UNION SELECT home_team_id FROM fixtures WHERE competition_id=$1 AND season_id=$2 UNION SELECT away_team_id FROM fixtures WHERE competition_id=$1 AND season_id=$2 UNION SELECT team_id FROM standings_current WHERE competition_id=$1 AND season_id=$2) members ON members.team_id=t.id WHERE NOT t.provider_placeholder ORDER BY t.name`,values),
      this.db.query<Row>('SELECT capability,status,checked_at FROM sports_season_coverage WHERE season_id=$1',[season.id]),
      this.db.query<Row>(`SELECT p.*,c.slug,s.name AS season_name,count(*) OVER()::int AS total FROM sports_pending_fixtures p JOIN competitions c ON c.id=p.competition_id JOIN seasons s ON s.id=p.season_id WHERE p.season_id=$1 ORDER BY p.kickoff NULLS LAST,p.id LIMIT $2 OFFSET $3`,[season.id,sportsPageSize,(page-1)*sportsPageSize]),
      this.db.query<Row>(`SELECT u.*,p.public_id AS player_public_id,p.display_name AS player_name,t.public_id AS team_public_id,t.name AS team_name,t.image_url AS team_image_url FROM sports_unlinked_competition_records u LEFT JOIN players p ON p.id=u.player_id LEFT JOIN teams t ON t.id=u.team_id WHERE u.season_id=$1 ORDER BY u.provider_record_id`,[season.id]),
    ]);
    base.counts={upcoming:Number(counts.rows[0]?.upcoming??0),results:Number(counts.rows[0]?.results??0)};
    base.availability=Object.fromEntries(coverageRows.rows.map(r=>[String(r.capability),{status:String(r.status),checkedAt:iso(r.checked_at)}]));
    base.pending=pendingRows.rows.map(pendingFixture);base.pendingTotal=Number(pendingRows.rows[0]?.total??0);
    base.upcoming=upcoming.rows.map(r=>fixture(r,locale));base.results=results.rows.map(r=>fixture(r,locale));
    const cards=await this.redCards([...base.upcoming,...base.results].map(f=>f.id));
    for(const f of [...base.upcoming,...base.results]){f.homeRedCards=cards[f.id]?.home;f.awayRedCards=cards[f.id]?.away;}
    base.standings=standingRows.rows.map((r):SportsStanding=>({...standingExtras(r),team:team(r),stage:string(r.stage_name),group:string(r.group_name),position:Number(r.position),played:number(r.played),won:number(r.won),drawn:number(r.drawn),lost:number(r.lost),goalsFor:number(r.goals_for),goalsAgainst:number(r.goals_against),goalDifference:number(r.goal_difference),points:number(r.points),updatedAt:iso(r.provider_updated_at??r.observed_at)}));
    base.scorers=scorerRows.rows.flatMap(r=>{const metrics=r.metrics as Row;const goals=numericStatistic(metrics.GOALS);return goals===null||goals===0?[]:[{publicId:String(r.player_public_id),name:String(r.display_name),team:team(r),goals,assists:numericStatistic(metrics.ASSISTS),appearances:numericStatistic(metrics.APPEARANCES),minutes:numericStatistic(metrics.MINUTES_PLAYED),rank:0}];}).sort((a,b)=>b.goals-a.goals||a.name.localeCompare(b.name));
    for(const row of unlinkedRows.rows.filter(r=>r.capability==='STANDINGS').map(unlinkedStanding)){
      const group=base.standings.map((r,i)=>({r,i})).filter(({r})=>r.stage===row.stage&&r.group===row.group);
      const index=group.find(({r})=>r.position>row.position)?.i??(group.length?group[group.length-1].i+1:base.standings.length);
      base.standings.splice(index,0,row);
    }
    base.scorers.push(...unlinkedScorers(unlinkedRows.rows.filter(r=>r.capability==='SCORERS'),locale));
    base.scorers.sort((a,b)=>b.goals-a.goals||a.name.localeCompare(b.name));
    base.scorers.forEach((r,i,rows)=>{r.rank=i&&rows[i-1].goals===r.goals?rows[i-1].rank:i+1;});
    base.teams=teamRows.rows.map(r=>team(r));return base;
  }
  async search(query:string,locale:InterfaceLocale):Promise<SportsSearchResult[]>{
    if(query.length<2)return [];
    const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const [competitions,teams,players]=await Promise.all([
      this.db.query<Row>(`SELECT slug,canonical_name FROM competitions WHERE enabled AND (canonical_name ILIKE $1 OR display_name_pt_br ILIKE $1 OR display_name_es_mx ILIKE $1) ORDER BY priority_br LIMIT 10`,[pattern]),
      this.db.query<Row>(`SELECT t.public_id,t.name,co.name AS context FROM teams t LEFT JOIN countries co ON co.id=t.country_id WHERE (t.name ILIKE $1 OR t.short_name ILIKE $1) AND EXISTS(SELECT 1 FROM team_seasons ts JOIN seasons s ON s.id=ts.season_id JOIN competitions c ON c.id=s.competition_id WHERE ts.team_id=t.id AND c.enabled) ORDER BY t.name LIMIT 15`,[pattern]),
      this.db.query<Row>(`SELECT p.public_id,p.display_name AS name,p.position_name AS context FROM players p WHERE (p.display_name ILIKE $1 OR p.name ILIKE $1) AND EXISTS(SELECT 1 FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id WHERE sm.player_id=p.id AND c.enabled) ORDER BY p.display_name LIMIT 15`,[pattern]),
    ]);
    return [...competitions.rows.map(r=>({kind:'competition' as const,publicId:String(r.slug),name:competitionName(locale,String(r.slug))??String(r.canonical_name),context:null,slug:String(r.slug)})),...teams.rows.map(r=>({kind:'team' as const,publicId:String(r.public_id),name:String(r.name),context:string(r.context),slug:null})),...players.rows.map(r=>({kind:'player' as const,publicId:String(r.public_id),name:String(r.name),context:string(r.context),slug:null}))];
  }
  async pending(publicId:string):Promise<PendingSportsFixture|null>{
    const r=(await this.db.query<Row>(`SELECT p.*,c.slug,s.name AS season_name FROM sports_pending_fixtures p JOIN competitions c ON c.id=p.competition_id JOIN seasons s ON s.id=p.season_id WHERE p.public_id=$1 AND c.enabled`,[publicId])).rows[0];
    return r?pendingFixture(r):null;
  }
  async teamHistory(publicId:string,locale:InterfaceLocale,view:'fixtures'|'results',page:number,seasonId?:string){
    const teamRow=(await this.db.query<Row>('SELECT id FROM teams WHERE public_id=$1',[publicId])).rows[0];if(!teamRow)return {rows:[],hasNext:false};
    const status=view==='results'?"f.status='FINISHED'":"f.status IN ('SCHEDULED','LIVE','HALFTIME','POSTPONED')";
    const rows=(await this.db.query<Row>(`SELECT ${fixtureColumns} ${fixtureJoins} WHERE (f.home_team_id=$1 OR f.away_team_id=$1) AND c.enabled AND ${status} AND ($2::uuid IS NULL OR f.season_id=$2) ORDER BY f.kickoff ${view==='results'?'DESC':'ASC'},f.id LIMIT $3 OFFSET $4`,[teamRow.id,seasonId??null,sportsPageSize+1,(page-1)*sportsPageSize])).rows;
    return {rows:rows.slice(0,sportsPageSize).map(r=>fixture(r,locale)),hasNext:rows.length>sportsPageSize};
  }
}
