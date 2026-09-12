import { describe, expect, it, vi } from 'vitest';
import { PostgresProfileRepository } from './repository';
import { persistedStatistic } from './statistics';

vi.mock('server-only',()=>({}));

describe('persisted profile statistic semantics', () => {
  it('preserves a verified zero and does not turn missing data into zero', () => {
    expect(persistedStatistic({GOALS:{total:0}},['GOALS'])).toBe(0);
    expect(persistedStatistic({},['GOALS'])).toBeNull();
    expect(persistedStatistic({GOALS:{}},['GOALS'])).toBeNull();
  });

  it('uses an explicit key order for rating and rejects nonnumeric values', () => {
    expect(persistedStatistic({RATING:{average:'7.42',total:10}},['RATING'],['average','total'])).toBe(7.42);
    expect(persistedStatistic({RATING:{average:'unknown'}},['RATING'])).toBeNull();
  });
});

describe('player profile read model', () => {
  it('normalizes database dates and emits one appearance per canonical fixture', async () => {
    const fixture = { id:'fixture-id',public_id:'0123456789abcdef',kickoff:new Date('2026-09-06T15:00:00Z'),status:'FINISHED',
      home_score:0,away_score:1,competition_name:'Brasileirão Série A',home_team_id:'home',home_public_id:'1111111111111111',
      home_name:'Remo',home_image:null,away_team_id:'away',away_public_id:'2222222222222222',away_name:'Flamengo',away_image:null,
      player_team_id:'away',lineup_type:'UNKNOWN',jersey_number:null,event_goals:0,event_assists:0,event_yellow_cards:0,event_red_cards:0,
      player_statistics:{MINUTES_PLAYED:{total:90}} };
    const database = { query: async (sql:string) => {
      if (sql.includes('SELECT * FROM players')) return { rows:[{ id:'player-id',public_id:'fedcba9876543210',display_name:'Agustín Rossi',
        common_name:null,image_url:null,nationality_name:'Argentina',country_name:'Argentina',position_name:'Goalkeeper',detailed_position_name:null,
        date_of_birth:new Date('1995-08-20T00:00:00Z'),height_cm:193,weight_kg:92,provider_updated_at:new Date('2026-09-06T16:00:00Z') }] };
      if (sql.includes('WITH raw_participation')) return { rows:[fixture,fixture] };
      return { rows:[] };
    } };
    const result = await new PostgresProfileRepository(database as never).player('fedcba9876543210','br');
    expect(result?.dateOfBirth).toBe('1995-08-20');
    expect(result?.matches.data).toHaveLength(1);
    expect(result?.matches.data[0]?.minutesPlayed).toBe(90);
  });

  it('keeps thin lineup-only players out of the sitemap', async () => {
    let statement = '';
    const database = { query: async (sql:string) => {
      statement = sql;
      return { rows:[] };
    } };
    await new PostgresProfileRepository(database as never).sitemapPlayers();
    expect(statement).toContain('EXISTS (SELECT 1 FROM team_squad_memberships');
    expect(statement).toContain('fixture_player_statistics');
    expect(statement).not.toContain('HAVING count(DISTINCT fl.fixture_id)>0');
  });
});
