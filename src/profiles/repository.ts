import 'server-only';
import type { DatabaseClient } from '@/database/client';
import type { SiteLocale } from '@/config/i18n';
import type {
  PlayerMatchLog, PlayerProfileView, ProfileCompetitionContext, ProfileFixture, ProfileModule, ProfileModuleState,
  ProfileStanding, ProfileStatistic, SquadContext, TeamProfileView,
} from './types';
import { persistedStatistic } from './statistics';

type Row = Record<string, unknown>;
const nullableString = (value: unknown) => value === null || value === undefined || value === '' ? null : String(value);
const nullableNumber = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
const iso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const dateOnly = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

interface StateMeta { state: ProfileModuleState; providerUpdatedAt: string | null; lastSuccessfulRefreshAt: string | null; }

const teamMetrics: Record<string, { key: string; unit?: string }> = {
  WIN: { key: 'all' }, DRAW: { key: 'all' }, LOST: { key: 'all' }, GOALS: { key: 'all' },
  GOALS_CONCEDED: { key: 'all' }, CLEANSHEET: { key: 'all' }, YELLOWCARDS: { key: 'count' },
  REDCARDS: { key: 'count' }, CORNERS: { key: 'count' }, BALL_POSSESSION: { key: 'average', unit: '%' },
};
const playerMetrics: Record<string, { key: string; unit?: string }> = {
  APPEARANCES: { key: 'total' }, LINEUPS: { key: 'total' }, MINUTES_PLAYED: { key: 'total' },
  GOALS: { key: 'total' }, ASSISTS: { key: 'total' }, YELLOWCARDS: { key: 'total' }, REDCARDS: { key: 'total' },
  SHOTS: { key: 'total' }, SHOTS_ON_TARGET: { key: 'total' }, SAVES: { key: 'total' },
  CLEANSHEET: { key: 'total' }, RATING: { key: 'average' },
};

function knownStatistic(row: Row, whitelist: Record<string, { key: string; unit?: string }>): ProfileStatistic | null {
  const code = String(row.developer_name ?? '');
  const definition = whitelist[code];
  const raw = row.value && typeof row.value === 'object' ? row.value as Record<string, unknown> : {};
  const value = definition ? raw[definition.key] : undefined;
  if (!definition || (typeof value !== 'number' && typeof value !== 'string')) return null;
  const numeric = typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
  if (typeof numeric !== 'number' && typeof numeric !== 'string') return null;
  return { competitionId: String(row.competition_id), competition: String(row.competition_name), seasonId: String(row.season_id),
    season: String(row.season_name), teamId: String(row.team_id), team: String(row.team_name), typeId: Number(row.provider_type_id),
    code, label: String(row.type_name), value: numeric, unit: definition.unit ?? null };
}

function fixture(row: Row): ProfileFixture {
  return { id: String(row.id), publicId: String(row.public_id), competition: String(row.competition_name),
    kickoff: new Date(String(row.kickoff)).toISOString(), status: row.status as ProfileFixture['status'],
    home: { id: String(row.home_team_id), publicId: String(row.home_public_id), name: String(row.home_name), imageUrl: nullableString(row.home_image) },
    away: { id: String(row.away_team_id), publicId: String(row.away_public_id), name: String(row.away_name), imageUrl: nullableString(row.away_image) },
    homeScore: nullableNumber(row.home_score), awayScore: nullableNumber(row.away_score) };
}

function moduleMeta(states: Map<string, StateMeta>, module: string, dataAvailable: boolean,
  empty: ProfileModuleState = 'NOT_YET_INGESTED'): Omit<ProfileModule<unknown>, 'data'> {
  return states.get(module) ?? { state: dataAvailable ? 'AVAILABLE' : empty, providerUpdatedAt: null, lastSuccessfulRefreshAt: null };
}

export class PostgresProfileRepository {
  constructor(private readonly database: DatabaseClient) {}

  private async states(entityType: 'TEAM' | 'PLAYER', entityId: string): Promise<Map<string, StateMeta>> {
    const result = await this.database.query<Row>(`SELECT module,state,provider_updated_at,last_success_at FROM profile_sync_state
      WHERE entity_type=$1 AND entity_id=$2`, [entityType, entityId]);
    return new Map(result.rows.map(row => [String(row.module), { state: row.state as ProfileModuleState,
      providerUpdatedAt: iso(row.provider_updated_at), lastSuccessfulRefreshAt: iso(row.last_success_at) }]));
  }

  private async contexts(teamId: string, locale: SiteLocale): Promise<ProfileCompetitionContext[]> {
    const result = await this.database.query<Row>(`SELECT c.id AS competition_id,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,c.slug,c.competition_type,
      s.id AS season_id,s.name AS season_name,s.is_current
      FROM team_seasons ts JOIN seasons s ON s.id=ts.season_id JOIN competitions c ON c.id=s.competition_id
      WHERE ts.team_id=$1 AND c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')
      ORDER BY s.is_current DESC,CASE WHEN $2='br' THEN c.priority_br ELSE c.priority_mx END,s.starts_at DESC NULLS LAST`, [teamId, locale]);
    return result.rows.map(row => ({ competitionId: String(row.competition_id), competition: String(row.competition_name),
      competitionSlug: String(row.slug), competitionType: String(row.competition_type), seasonId: String(row.season_id),
      season: String(row.season_name), isCurrent: Boolean(row.is_current) }));
  }

  private async fixtures(teamId: string, locale: SiteLocale): Promise<ProfileFixture[]> {
    const result = await this.database.query<Row>(`SELECT f.id,f.public_id,f.kickoff,f.status,f.home_score,f.away_score,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      f.home_team_id,ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image,
      f.away_team_id,at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE (f.home_team_id=$1 OR f.away_team_id=$1) AND c.enabled
      ORDER BY CASE WHEN f.kickoff>=now() THEN 0 ELSE 1 END,
        CASE WHEN f.kickoff>=now() THEN f.kickoff END ASC,CASE WHEN f.kickoff<now() THEN f.kickoff END DESC LIMIT 36`, [teamId, locale]);
    return result.rows.map(fixture);
  }

  private async standings(teamId: string, locale: SiteLocale): Promise<ProfileStanding[]> {
    const result = await this.database.query<Row>(`SELECT CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      s.name AS season_name,sc.stage_name,sc.group_name,sc.position,sc.played,sc.won,sc.drawn,sc.lost,sc.goals_for,sc.goals_against,sc.points
      FROM standings_current sc JOIN seasons s ON s.id=sc.season_id JOIN competitions c ON c.id=sc.competition_id
      WHERE sc.team_id=$1 AND c.enabled ORDER BY s.is_current DESC,sc.observed_at DESC,c.slug,sc.position LIMIT 12`, [teamId, locale]);
    return result.rows.map(row => ({ competition: String(row.competition_name), season: String(row.season_name),
      stage: nullableString(row.stage_name), group: nullableString(row.group_name), position: Number(row.position),
      played: nullableNumber(row.played), won: nullableNumber(row.won), drawn: nullableNumber(row.drawn), lost: nullableNumber(row.lost),
      goalsFor: nullableNumber(row.goals_for), goalsAgainst: nullableNumber(row.goals_against), points: nullableNumber(row.points) }));
  }

  private async squad(teamId: string, locale: SiteLocale): Promise<SquadContext[]> {
    const result = await this.database.query<Row>(`SELECT s.id AS season_id,s.name AS season_name,s.is_current,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      p.id,p.public_id,p.display_name,p.image_url,sm.position_id,sm.position_name,sm.jersey_number
      FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id
      JOIN players p ON p.id=sm.player_id WHERE sm.team_id=$1
      ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST,c.slug,sm.position_id NULLS LAST,sm.jersey_number NULLS LAST,p.display_name`, [teamId, locale]);
    const contexts = new Map<string, SquadContext>();
    for (const row of result.rows) {
      const key = String(row.season_id);
      const context = contexts.get(key) ?? { competition: String(row.competition_name), season: String(row.season_name), seasonId: key, players: [] };
      context.players.push({ id: String(row.id), publicId: String(row.public_id), name: String(row.display_name),
        imageUrl: nullableString(row.image_url), positionId: nullableNumber(row.position_id), position: nullableString(row.position_name),
        jerseyNumber: nullableNumber(row.jersey_number) });
      contexts.set(key, context);
    }
    return [...contexts.values()];
  }

  private async teamStatistics(teamId: string, locale: SiteLocale): Promise<ProfileStatistic[]> {
    const result = await this.database.query<Row>(`SELECT ts.team_id,t.name AS team_name,ts.season_id,s.name AS season_name,ts.competition_id,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      ts.provider_type_id,st.name AS type_name,st.developer_name,ts.value
      FROM team_season_statistics ts JOIN teams t ON t.id=ts.team_id JOIN seasons s ON s.id=ts.season_id
      JOIN competitions c ON c.id=ts.competition_id JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ts.provider_type_id
      WHERE ts.team_id=$1 ORDER BY s.is_current DESC,c.slug,ts.provider_type_id`, [teamId, locale]);
    return result.rows.flatMap(row => { const value = knownStatistic(row, teamMetrics); return value ? [value] : []; });
  }

  async team(publicId: string, locale: SiteLocale): Promise<TeamProfileView | null> {
    const result = await this.database.query<Row>(`SELECT t.*,co.name AS country_name FROM teams t LEFT JOIN countries co ON co.id=t.country_id WHERE t.public_id=$1`, [publicId]);
    const row = result.rows[0];
    if (!row) return null;
    const teamId = String(row.id);
    const [contexts, matches, standings, squad, statistics, states] = await Promise.all([
      this.contexts(teamId, locale), this.fixtures(teamId, locale), this.standings(teamId, locale), this.squad(teamId, locale),
      this.teamStatistics(teamId, locale), this.states('TEAM', teamId),
    ]);
    const now = Date.now();
    const upcoming = matches.filter(item => new Date(item.kickoff).getTime() >= now).slice(0, 8);
    const recent = matches.filter(item => new Date(item.kickoff).getTime() < now).slice(0, 10);
    return { entityType: 'TEAM', id: teamId, publicId: String(row.public_id), locale, name: String(row.name),
      shortName: nullableString(row.short_name), imageUrl: nullableString(row.image_url), country: nullableString(row.country_name),
      foundedYear: nullableNumber(row.founded_year), venue: nullableString(row.venue_name), venueCity: nullableString(row.venue_city),
      coach: nullableString(row.coach_name), competitions: contexts, upcoming, recent,
      standings: { ...moduleMeta(states, 'STANDINGS', standings.length > 0, contexts.every(item => item.competitionType === 'DOMESTIC_CUP') ? 'NOT_APPLICABLE' : 'NOT_YET_INGESTED'), data: standings },
      squad: { ...moduleMeta(states, 'SQUAD', squad.length > 0), data: squad },
      statistics: { ...moduleMeta(states, 'STATISTICS', statistics.length > 0), data: statistics },
      lastModifiedAt: new Date(String(row.profile_updated_at ?? row.updated_at)).toISOString(),
      indexable: Boolean(matches.length || squad.some(item => item.players.length) || statistics.length), providerRequests: 0 };
  }

  private async playerContexts(playerId: string, locale: SiteLocale) {
    const result = await this.database.query<Row>(`SELECT sm.team_id,t.public_id AS team_public_id,t.name AS team_name,t.image_url AS team_image,
      s.id AS season_id,s.name AS season_name,s.is_current,c.id AS competition_id,c.slug,c.competition_type,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name
      FROM team_squad_memberships sm JOIN teams t ON t.id=sm.team_id JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id
      WHERE sm.player_id=$1 ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST,sm.observed_at DESC`, [playerId, locale]);
    return result.rows;
  }

  private async playerStatistics(playerId: string, locale: SiteLocale): Promise<ProfileStatistic[]> {
    const result = await this.database.query<Row>(`SELECT ps.player_id,ps.team_id,t.name AS team_name,ps.season_id,s.name AS season_name,ps.competition_id,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      ps.provider_type_id,st.name AS type_name,st.developer_name,ps.value
      FROM player_season_statistics ps JOIN teams t ON t.id=ps.team_id JOIN seasons s ON s.id=ps.season_id
      JOIN competitions c ON c.id=ps.competition_id JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=ps.provider_type_id
      WHERE ps.player_id=$1 ORDER BY s.is_current DESC,c.slug,t.name,ps.provider_type_id`, [playerId, locale]);
    return result.rows.flatMap(row => { const value = knownStatistic(row, playerMetrics); return value ? [value] : []; });
  }

  private async playerMatches(playerId: string, locale: SiteLocale): Promise<PlayerMatchLog[]> {
    const result = await this.database.query<Row>(`WITH raw_participation AS (
      SELECT fl.fixture_id,fl.player_entity_id AS player_id,fl.team_id,fl.lineup_type,fl.jersey_number
        FROM fixture_lineups fl WHERE fl.player_entity_id=$1
      UNION ALL
      SELECT fps.fixture_id,fps.player_id,fps.team_id,'UNKNOWN'::text,NULL::integer
        FROM fixture_player_statistics fps WHERE fps.player_id=$1 AND NOT EXISTS
          (SELECT 1 FROM fixture_lineups fl WHERE fl.fixture_id=fps.fixture_id AND fl.player_entity_id=fps.player_id)
      ), participation AS (
        SELECT DISTINCT ON (fixture_id) fixture_id,player_id,team_id,lineup_type,jersey_number
        FROM raw_participation
        ORDER BY fixture_id,CASE WHEN lineup_type='UNKNOWN' THEN 1 ELSE 0 END,jersey_number NULLS LAST
      ) SELECT f.id,f.public_id,f.kickoff,f.status,f.home_score,f.away_score,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      f.home_team_id,ht.public_id AS home_public_id,ht.name AS home_name,ht.image_url AS home_image,
      f.away_team_id,at.public_id AS away_public_id,at.name AS away_name,at.image_url AS away_image,
      fl.team_id AS player_team_id,fl.lineup_type,fl.jersey_number,
      ev.goals AS event_goals,ev.assists AS event_assists,ev.yellow_cards AS event_yellow_cards,ev.red_cards AS event_red_cards,
      ps.statistics AS player_statistics
      FROM participation fl JOIN fixtures f ON f.id=fl.fixture_id JOIN competitions c ON c.id=f.competition_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      LEFT JOIN LATERAL (SELECT
        count(*) FILTER (WHERE upper(fe.event_type) LIKE '%GOAL%' AND fe.player_entity_id=$1 AND fe.rescinded=false) AS goals,
        count(*) FILTER (WHERE upper(fe.event_type) LIKE '%ASSIST%' AND fe.player_entity_id=$1 AND fe.rescinded=false) AS assists,
        count(*) FILTER (WHERE upper(fe.event_type) LIKE '%YELLOW%' AND fe.player_entity_id=$1 AND fe.rescinded=false) AS yellow_cards,
        count(*) FILTER (WHERE upper(fe.event_type) LIKE '%RED%' AND fe.player_entity_id=$1 AND fe.rescinded=false) AS red_cards
        FROM fixture_events fe WHERE fe.fixture_id=f.id) ev ON true
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(st.developer_name,fps.value) AS statistics
        FROM fixture_player_statistics fps JOIN profile_statistic_types st
          ON st.provider='SPORTMONKS' AND st.provider_type_id=fps.provider_type_id
        WHERE fps.fixture_id=f.id AND fps.player_id=$1) ps ON true
      WHERE fl.player_id=$1
      ORDER BY f.kickoff DESC LIMIT 20`, [playerId, locale]);
    const seenFixtures = new Set<string>();
    return result.rows.filter(row => {
      const fixtureId = String(row.id);
      if (seenFixtures.has(fixtureId)) return false;
      seenFixtures.add(fixtureId);
      return true;
    }).map(row => {
      const goals = persistedStatistic(row.player_statistics,['GOALS']);
      const assists = persistedStatistic(row.player_statistics,['ASSISTS']);
      const yellowCards = persistedStatistic(row.player_statistics,['YELLOWCARDS','YELLOW_CARDS']);
      const redCards = persistedStatistic(row.player_statistics,['REDCARDS','RED_CARDS']);
      const eventValue = (value: unknown) => Number(value) > 0 ? Number(value) : null;
      return { ...fixture(row), playerTeamId: String(row.player_team_id),
        opponent: String(row.player_team_id === row.home_team_id ? row.away_name : row.home_name),
        starter: row.lineup_type === 'UNKNOWN' ? null : row.lineup_type === 'STARTER', jerseyNumber: nullableNumber(row.jersey_number),
        goals: goals ?? eventValue(row.event_goals), assists: assists ?? eventValue(row.event_assists),
        yellowCards: yellowCards ?? eventValue(row.event_yellow_cards), redCards: redCards ?? eventValue(row.event_red_cards),
        minutesPlayed: persistedStatistic(row.player_statistics,['MINUTES_PLAYED','MINUTES']),
        shots: persistedStatistic(row.player_statistics,['SHOTS','SHOTS_TOTAL']),
        shotsOnTarget: persistedStatistic(row.player_statistics,['SHOTS_ON_TARGET']),
        saves: persistedStatistic(row.player_statistics,['SAVES']),
        rating: persistedStatistic(row.player_statistics,['RATING'],['average','value','total']) };
    });
  }

  async player(publicId: string, locale: SiteLocale): Promise<PlayerProfileView | null> {
    const result = await this.database.query<Row>('SELECT * FROM players WHERE public_id=$1', [publicId]);
    const row = result.rows[0];
    if (!row) return null;
    const playerId = String(row.id);
    const [contextRows, statistics, matches, states] = await Promise.all([
      this.playerContexts(playerId, locale), this.playerStatistics(playerId, locale), this.playerMatches(playerId, locale), this.states('PLAYER', playerId),
    ]);
    const first = contextRows[0];
    const contexts = contextRows.map(item => ({ competitionId: String(item.competition_id), competition: String(item.competition_name),
      competitionSlug: String(item.slug), competitionType: String(item.competition_type), seasonId: String(item.season_id),
      season: String(item.season_name), isCurrent: Boolean(item.is_current), teamId: String(item.team_id),
      teamPublicId: String(item.team_public_id), team: String(item.team_name) }));
    const currentTeam = first ? { id: String(first.team_id), publicId: String(first.team_public_id), name: String(first.team_name), imageUrl: nullableString(first.team_image) } : null;
    return { entityType: 'PLAYER', id: playerId, publicId: String(row.public_id), locale, name: String(row.display_name),
      commonName: nullableString(row.common_name), imageUrl: nullableString(row.image_url), nationality: nullableString(row.nationality_name),
      country: nullableString(row.country_name), position: nullableString(row.position_name), detailedPosition: nullableString(row.detailed_position_name),
      dateOfBirth: dateOnly(row.date_of_birth), heightCm: nullableNumber(row.height_cm), weightKg: nullableNumber(row.weight_kg),
      currentTeam, contexts, statistics: { ...moduleMeta(states, 'STATISTICS', statistics.length > 0), data: statistics },
      matches: { ...moduleMeta(states, 'MATCH_LOG', matches.length > 0), data: matches },
      lastModifiedAt: new Date(String(row.provider_updated_at ?? row.updated_at)).toISOString(),
      indexable: Boolean(currentTeam && (statistics.length || matches.length)), providerRequests: 0 };
  }

  async sitemapTeams(limit = 5000) {
    const result = await this.database.query<Row>(`SELECT t.public_id,t.name,GREATEST(t.updated_at,COALESCE(max(f.updated_at),t.updated_at),
      COALESCE(max(sm.observed_at),t.updated_at)) AS updated_at
      FROM teams t LEFT JOIN fixtures f ON f.home_team_id=t.id OR f.away_team_id=t.id
      LEFT JOIN team_squad_memberships sm ON sm.team_id=t.id GROUP BY t.id
      HAVING count(DISTINCT f.id)>0 OR count(DISTINCT sm.player_id)>0 ORDER BY updated_at DESC LIMIT $1`, [limit]);
    return result.rows.map(row => ({ publicId: String(row.public_id), name: String(row.name), updatedAt: new Date(String(row.updated_at)) }));
  }

  async sitemapPlayers(limit = 10000) {
    const result = await this.database.query<Row>(`SELECT p.public_id,p.display_name,GREATEST(p.updated_at,COALESCE(max(ps.observed_at),p.updated_at),
      COALESCE(max(fl.observed_at),p.updated_at)) AS updated_at
      FROM players p LEFT JOIN player_season_statistics ps ON ps.player_id=p.id LEFT JOIN fixture_lineups fl ON fl.player_entity_id=p.id
      GROUP BY p.id HAVING count(DISTINCT ps.provider_type_id)>0 OR count(DISTINCT fl.fixture_id)>0 ORDER BY updated_at DESC LIMIT $1`, [limit]);
    return result.rows.map(row => ({ publicId: String(row.public_id), name: String(row.display_name), updatedAt: new Date(String(row.updated_at)) }));
  }
}
