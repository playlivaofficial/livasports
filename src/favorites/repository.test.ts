import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {FavoritesRepository} from './repository';
import {MemoryFavoritesDatabase} from './memory';

vi.mock('server-only',()=>({}));

const teamId='0123456789abcdef';
const fixtureId='fedcba9876543210';

function setup(){
  const database=new MemoryFavoritesDatabase();
  const userA=database.addUser();
  const userB=database.addUser();
  const home=database.addTeam(teamId);
  const away=database.addTeam('aaaaaaaaaaaaaaaa');
  const competition=database.addCompetition('premier-league');
  const fixture=database.addFixture({public_id:fixtureId,competition_id:competition.id,home_team_id:home.id,away_team_id:away.id,status:'SCHEDULED',kickoff:new Date(Date.now()+36e5)});
  const live=database.addFixture({public_id:'1111111111111111',competition_id:competition.id,home_team_id:home.id,away_team_id:away.id,status:'LIVE',kickoff:new Date()});
  const finished=database.addFixture({public_id:'2222222222222222',competition_id:competition.id,home_team_id:home.id,away_team_id:away.id,status:'FINISHED',kickoff:new Date(Date.now()-36e5)});
  return {database,repo:new FavoritesRepository(database),userA,userB,home,away,competition,fixture,live,finished};
}

describe('authenticated favorites repository',()=>{
  it('creates unique favorites, ignores duplicate inserts and missing deletes',async()=>{
    const {repo,userA}=setup();
    expect(await repo.setFavorite(userA,'team',teamId,true)).toEqual({ok:true,favorited:true});
    expect(await repo.setFavorite(userA,'team',teamId,true)).toEqual({ok:true,favorited:true});
    expect((await repo.listPublic(userA)).teams).toEqual([teamId]);
    expect(await repo.setFavorite(userA,'team',teamId,false)).toEqual({ok:true,favorited:false});
    expect(await repo.setFavorite(userA,'team',teamId,false)).toEqual({ok:true,favorited:false});
    expect(await repo.setFavorite(userA,'team','9999999999999999',true)).toEqual({ok:false,error:'NOT_FOUND'});
    expect(await repo.setFavorite(userA,'fixture','9999999999999999',false)).toEqual({ok:true,favorited:false});
  });

  it('isolates users and never mutates another account during merge',async()=>{
    const {repo,userA,userB}=setup();
    await repo.setFavorite(userB,'competition','premier-league',true);
    const first=await repo.mergePublic(userA,{version:1,teams:[teamId],competitions:['premier-league'],fixtures:[fixtureId]});
    const again=await repo.mergePublic(userA,{version:1,teams:[teamId],competitions:['premier-league'],fixtures:[fixtureId]});
    expect(first.favorites.teams).toEqual([teamId]);
    expect(again.favorites).toEqual(first.favorites);
    expect((await repo.listPublic(userB)).competitions).toEqual(['premier-league']);
    expect((await repo.listPublic(userB)).teams).toEqual([]);
    const mixed=await repo.mergePublic(userA,{version:1,teams:[teamId,'deadbeefdeadbeef'],competitions:['missing-slug'],fixtures:[fixtureId]});
    expect(mixed.skipped).toBe(2);
    expect(mixed.favorites.teams).toEqual([teamId]);
  });

  it('aggregates favorite fixture, team and competition matches once with LIVE first',async()=>{
    const {repo,userA,live,fixture}=setup();
    await repo.setFavorite(userA,'fixture',fixture.public_id,true);
    await repo.setFavorite(userA,'team',teamId,true);
    await repo.setFavorite(userA,'competition','premier-league',true);
    const rows=await repo.feedForUser(userA,'en');
    expect(rows.filter(row=>row.fixture.publicId===fixture.public_id)).toHaveLength(1);
    expect(rows[0]?.fixture.publicId).toBe(live.public_id);
    expect(new Set(rows.map(row=>row.fixture.id)).size).toBe(rows.length);
  });

  it('rejects a non-uuid caller and parameterized statements never embed the user id in SQL text',async()=>{
    const {repo,database}=setup();
    expect(await repo.listPublic('not-a-user')).toEqual({teams:[],competitions:[],fixtures:[]});
    await repo.setFavorite(randomUUID(),'team',teamId,true);
    expect(database.statements.every(row=>!row.sql.includes(teamId)||row.sql.includes('$'))).toBe(true);
  });
});
