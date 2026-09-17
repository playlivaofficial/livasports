import {randomUUID} from 'node:crypto';
import type {QueryResult,QueryResultRow} from 'pg';
import type {QueryExecutor} from '@/database/client';

type Team={id:string;public_id:string};
type Competition={id:string;slug:string;enabled:boolean};
type Fixture={id:string;public_id:string;competition_id:string;home_team_id:string;away_team_id:string;kickoff:Date;status:string;season_id:string|null;round_name:string|null;stage_name:string|null;home_score:number|null;away_score:number|null};
type Favorite={user_id:string;entity_id:string;created_at:Date};

function ok<Row extends QueryResultRow>(rows:object[]):QueryResult<Row> {
  return {rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]} as unknown as QueryResult<Row>;
}

export class MemoryFavoritesDatabase implements QueryExecutor {
  statements:{sql:string;params:unknown[]}[]=[];
  users=new Set<string>();
  teams:Team[]=[];
  competitions:Competition[]=[];
  fixtures:Fixture[]=[];
  pending=new Set<string>();
  favoriteTeams:Favorite[]=[];
  favoriteCompetitions:Favorite[]=[];
  favoriteFixtures:Favorite[]=[];

  addUser(id=randomUUID()):string {this.users.add(id);return id;}
  addTeam(publicId:string,id=randomUUID()):Team {const team={id,public_id:publicId};this.teams.push(team);return team;}
  addCompetition(slug:string,id=randomUUID(),enabled=true):Competition {const row={id,slug,enabled};this.competitions.push(row);return row;}
  addFixture(input:Partial<Fixture>&{public_id:string;competition_id:string;home_team_id:string;away_team_id:string}):Fixture {
    const row:Fixture={id:input.id??randomUUID(),public_id:input.public_id,competition_id:input.competition_id,home_team_id:input.home_team_id,away_team_id:input.away_team_id,kickoff:input.kickoff??new Date(),status:input.status??'SCHEDULED',season_id:input.season_id??null,round_name:input.round_name??null,stage_name:input.stage_name??null,home_score:input.home_score??null,away_score:input.away_score??null};
    this.fixtures.push(row);return row;
  }

  async transaction<T>(work:(client:QueryExecutor)=>Promise<T>):Promise<T> {
    return work(this);
  }

  async query<Row extends QueryResultRow=QueryResultRow>(sql:string,params:unknown[]=[]):Promise<QueryResult<Row>> {
    this.statements.push({sql,params:[...params]});
    const text=sql.replace(/\s+/g,' ').trim();
    const ids=(value:unknown)=>Array.isArray(value)?value.map(String):[];
    if(text==='SELECT id FROM teams WHERE public_id=$1')return ok(this.teams.filter(row=>row.public_id===params[0]));
    if(text==='SELECT id FROM competitions WHERE slug=$1 AND enabled')return ok(this.competitions.filter(row=>row.slug===params[0]&&row.enabled));
    if(text.startsWith('SELECT id FROM fixtures WHERE public_id=$1'))return ok(this.fixtures.filter(row=>row.public_id===params[0]&&!this.pending.has(row.id)));
    if(text.includes('SELECT t.public_id FROM user_favorite_teams')){
      return ok(this.favoriteTeams.filter(row=>row.user_id===params[0]).sort((a,b)=>a.created_at.getTime()-b.created_at.getTime()).flatMap(row=>{
        const team=this.teams.find(item=>item.id===row.entity_id);return team?[{public_id:team.public_id}]:[];
      }));
    }
    if(text.includes('SELECT c.slug AS public_id FROM user_favorite_competitions')){
      return ok(this.favoriteCompetitions.filter(row=>row.user_id===params[0]).sort((a,b)=>a.created_at.getTime()-b.created_at.getTime()).flatMap(row=>{
        const competition=this.competitions.find(item=>item.id===row.entity_id);return competition?[{public_id:competition.slug}]:[];
      }));
    }
    if(text.includes('SELECT fx.public_id FROM user_favorite_fixtures')){
      return ok(this.favoriteFixtures.filter(row=>row.user_id===params[0]).sort((a,b)=>a.created_at.getTime()-b.created_at.getTime()).flatMap(row=>{
        const fixture=this.fixtures.find(item=>item.id===row.entity_id);return fixture?[{public_id:fixture.public_id}]:[];
      }));
    }
    if(text.includes('SELECT count(*)::int AS n FROM user_favorite_teams WHERE user_id=$1 AND'))return ok([{n:this.favoriteTeams.filter(row=>row.user_id===params[0]&&row.entity_id===params[1]).length}]);
    if(text.includes('SELECT count(*)::int AS n FROM user_favorite_competitions WHERE user_id=$1 AND'))return ok([{n:this.favoriteCompetitions.filter(row=>row.user_id===params[0]&&row.entity_id===params[1]).length}]);
    if(text.includes('SELECT count(*)::int AS n FROM user_favorite_fixtures WHERE user_id=$1 AND'))return ok([{n:this.favoriteFixtures.filter(row=>row.user_id===params[0]&&row.entity_id===params[1]).length}]);
    if(text.includes('SELECT count(*)::int AS n FROM user_favorite_teams WHERE user_id=$1'))return ok([{n:this.favoriteTeams.filter(row=>row.user_id===params[0]).length}]);
    if(text.includes('SELECT count(*)::int AS n FROM user_favorite_competitions WHERE user_id=$1'))return ok([{n:this.favoriteCompetitions.filter(row=>row.user_id===params[0]).length}]);
    if(text.includes('SELECT count(*)::int AS n FROM user_favorite_fixtures WHERE user_id=$1'))return ok([{n:this.favoriteFixtures.filter(row=>row.user_id===params[0]).length}]);
    if(text.includes('(SELECT count(*)::int FROM user_favorite_teams WHERE user_id=$1) AS teams')){
      return ok([{teams:this.favoriteTeams.filter(row=>row.user_id===params[0]).length,competitions:this.favoriteCompetitions.filter(row=>row.user_id===params[0]).length,fixtures:this.favoriteFixtures.filter(row=>row.user_id===params[0]).length}]);
    }
    if(text.startsWith('DELETE FROM user_favorite_teams')){this.favoriteTeams=this.favoriteTeams.filter(row=>!(row.user_id===params[0]&&row.entity_id===params[1]));return ok([]);}
    if(text.startsWith('DELETE FROM user_favorite_competitions')){this.favoriteCompetitions=this.favoriteCompetitions.filter(row=>!(row.user_id===params[0]&&row.entity_id===params[1]));return ok([]);}
    if(text.startsWith('DELETE FROM user_favorite_fixtures')){this.favoriteFixtures=this.favoriteFixtures.filter(row=>!(row.user_id===params[0]&&row.entity_id===params[1]));return ok([]);}
    if(text.startsWith('INSERT INTO user_favorite_teams (user_id, team_id) VALUES')){
      if(!this.favoriteTeams.some(row=>row.user_id===params[0]&&row.entity_id===params[1]))this.favoriteTeams.push({user_id:String(params[0]),entity_id:String(params[1]),created_at:new Date()});
      return ok([]);
    }
    if(text.startsWith('INSERT INTO user_favorite_competitions (user_id, competition_id) VALUES')){
      if(!this.favoriteCompetitions.some(row=>row.user_id===params[0]&&row.entity_id===params[1]))this.favoriteCompetitions.push({user_id:String(params[0]),entity_id:String(params[1]),created_at:new Date()});
      return ok([]);
    }
    if(text.startsWith('INSERT INTO user_favorite_fixtures (user_id, fixture_id) VALUES')){
      if(!this.favoriteFixtures.some(row=>row.user_id===params[0]&&row.entity_id===params[1]))this.favoriteFixtures.push({user_id:String(params[0]),entity_id:String(params[1]),created_at:new Date()});
      return ok([]);
    }
    if(text.includes('INSERT INTO user_favorite_teams (user_id, team_id) SELECT')){
      for(const team of this.teams.filter(row=>ids(params[1]).includes(row.public_id))){
        if(!this.favoriteTeams.some(row=>row.user_id===params[0]&&row.entity_id===team.id))this.favoriteTeams.push({user_id:String(params[0]),entity_id:team.id,created_at:new Date()});
      }
      return ok([]);
    }
    if(text.includes('INSERT INTO user_favorite_competitions (user_id, competition_id) SELECT')){
      for(const competition of this.competitions.filter(row=>ids(params[1]).includes(row.slug)&&row.enabled)){
        if(!this.favoriteCompetitions.some(row=>row.user_id===params[0]&&row.entity_id===competition.id))this.favoriteCompetitions.push({user_id:String(params[0]),entity_id:competition.id,created_at:new Date()});
      }
      return ok([]);
    }
    if(text.includes('INSERT INTO user_favorite_fixtures (user_id, fixture_id) SELECT')){
      for(const fixture of this.fixtures.filter(row=>ids(params[1]).includes(row.public_id))){
        if(!this.favoriteFixtures.some(row=>row.user_id===params[0]&&row.entity_id===fixture.id))this.favoriteFixtures.push({user_id:String(params[0]),entity_id:fixture.id,created_at:new Date()});
      }
      return ok([]);
    }
    if(text.includes('SELECT public_id FROM teams WHERE public_id=ANY'))return ok(this.teams.filter(row=>ids(params[0]).includes(row.public_id)));
    if(text.includes('SELECT slug FROM competitions WHERE slug=ANY'))return ok(this.competitions.filter(row=>ids(params[0]).includes(row.slug)&&row.enabled).map(row=>({slug:row.slug})));
    if(text.includes('SELECT public_id FROM fixtures WHERE public_id=ANY'))return ok(this.fixtures.filter(row=>ids(params[0]).includes(row.public_id)&&!this.pending.has(row.id)));
    if(text.includes('SELECT id FROM teams WHERE public_id=ANY'))return ok(this.teams.filter(row=>ids(params[0]).includes(row.public_id)));
    if(text.includes('SELECT id FROM competitions WHERE slug=ANY'))return ok(this.competitions.filter(row=>ids(params[0]).includes(row.slug)&&row.enabled));
    if(text.includes('SELECT id FROM fixtures WHERE public_id=ANY'))return ok(this.fixtures.filter(row=>ids(params[0]).includes(row.public_id)));
    if(text.includes('AS favorite_reason')){
      const fixtureIds=ids(params[0]),teamIds=ids(params[1]),competitionIds=ids(params[2]);
      const now=Date.now();
      const rows=this.fixtures.filter(fixture=>{
        if(this.pending.has(fixture.id))return false;
        const competition=this.competitions.find(item=>item.id===fixture.competition_id);
        if(!competition?.enabled)return false;
        const matched=fixtureIds.includes(fixture.id)||teamIds.includes(fixture.home_team_id)||teamIds.includes(fixture.away_team_id)||competitionIds.includes(fixture.competition_id);
        if(!matched)return false;
        const live=fixture.status==='LIVE'||fixture.status==='HALFTIME';
        const kickoff=fixture.kickoff.getTime();
        return live||(kickoff>=now-7*86400000&&kickoff<=now+21*86400000);
      }).map(fixture=>{
        const competition=this.competitions.find(item=>item.id===fixture.competition_id)!;
        const home=this.teams.find(item=>item.id===fixture.home_team_id)!;
        const away=this.teams.find(item=>item.id===fixture.away_team_id)!;
        const reason=fixtureIds.includes(fixture.id)?'match':teamIds.includes(fixture.home_team_id)||teamIds.includes(fixture.away_team_id)?'team':'competition';
        return {
          id:fixture.id,public_id:fixture.public_id,season_id:fixture.season_id,kickoff:fixture.kickoff.toISOString(),status:fixture.status,round_name:fixture.round_name,stage_name:fixture.stage_name,home_score:fixture.home_score,away_score:fixture.away_score,slug:competition.slug,
          home_team_id:home.id,home_public_id:home.public_id,home_name:'Home',home_image_url:null,
          away_team_id:away.id,away_public_id:away.public_id,away_name:'Away',away_image_url:null,
          favorite_reason:reason,
        };
      });
      return ok(rows);
    }
    throw new Error('UNHANDLED_SQL '+text);
  }
}
