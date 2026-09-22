import 'server-only';
import {SportsSitemapRepository} from '@/sports/sitemap-repository';
import type { DatabaseClient } from '@/database/client';
import type { FixtureStatus } from '@/domain/enums';
import type { SiteLocale } from '@/config/i18n';
import type {
  MatchEventView, MatchFormView, MatchHeaderView, MatchHistoryView, MatchLineupTeamView, MatchModuleState,
  MatchOddsPriceView, MatchPlayerPerformanceView, MatchScoreView, MatchStandingView, MatchStatisticView, NextMatchView,
} from './types';
import { isPregameActionable } from './rules';
import type { CommercialGeo } from '@/odds/commercial-geo';

const iso = (value: unknown): string | null => value ? new Date(String(value)).toISOString() : null;
const numberOrNull = (value: unknown): number | null => value === null || value === undefined || value === '' ? null : Number(value);

function playerStatisticValue(code: string, value: unknown): number | string | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const keys = code === 'RATING' ? ['average', 'value', 'total'] : ['total', 'value', 'average'];
  for (const key of keys) {
    const candidate = raw[key];
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return null;
}

export interface MatchModuleMeta {
  state: MatchModuleState; providerUpdatedAt: string | null; lastSuccessfulRefreshAt: string | null; snapshotAt: string | null;
}

export class PostgresMatchCenterRepository {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * M1: the upcoming inventory a finished match should hand the reader on to. A fixture involving either
   * of these teams ranks above another fixture in the same competition, and within each group the soonest
   * kickoff wins. Reuses the same coverage, pending-draw and status rules as the rest of the read model,
   * so the block can never point at a fixture the site would not otherwise show.
   */
  async nextMatches(header: MatchHeaderView, limit = 3): Promise<NextMatchView[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT f.public_id,f.kickoff,c.slug AS competition_slug,
      CASE WHEN $5='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      ht.public_id AS home_public_id,ht.name AS home_name,at.public_id AS away_public_id,at.name AS away_name,
      CASE WHEN f.home_team_id IN ($2,$3) OR f.away_team_id IN ($2,$3) THEN 0 ELSE 1 END AS relation_rank
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE f.id<>$1 AND f.status='SCHEDULED' AND f.kickoff>=now()
        AND c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES')
        AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)
        AND (f.home_team_id IN ($2,$3) OR f.away_team_id IN ($2,$3) OR f.competition_id=$4)
      ORDER BY relation_rank,f.kickoff LIMIT ${Math.trunc(limit)}`,
      [header.id, header.home.id, header.away.id, header.competitionId, header.locale]);
    return result.rows.map(row => ({
      publicId: String(row.public_id), kickoff: new Date(String(row.kickoff)).toISOString(),
      competition: String(row.competition_name), competitionSlug: String(row.competition_slug),
      relation: Number(row.relation_rank) === 0 ? 'TEAM' : 'COMPETITION',
      home: { publicId: String(row.home_public_id), name: String(row.home_name) },
      away: { publicId: String(row.away_public_id), name: String(row.away_name) },
    }));
  }

  async header(publicId: string, locale: SiteLocale): Promise<MatchHeaderView | null> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT f.*,c.competition_type,c.slug AS competition_slug,
      CASE WHEN $2='br' THEN c.display_name_pt_br ELSE c.display_name_es_mx END AS competition_name,
      s.name AS stored_season_name,ht.public_id AS home_public_id,ht.name AS home_name,ht.short_name AS home_short,ht.image_url AS home_image,
      at.public_id AS away_public_id,at.name AS away_name,at.short_name AS away_short,at.image_url AS away_image
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id LEFT JOIN seasons s ON s.id=f.season_id
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE f.public_id=$1 AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)`, [publicId, locale]);
    const row = result.rows[0];
    if (!row) return null;
    const scoreResult = await this.database.query<Record<string, unknown>>(`SELECT fs.description,fs.goals,
      CASE WHEN fs.participant_id=f.home_team_id THEN 'home' WHEN fs.participant_id=f.away_team_id THEN 'away' END AS location
      FROM fixture_scores fs JOIN fixtures f ON f.id=fs.fixture_id WHERE fs.fixture_id=$1 ORDER BY fs.description,location`, [row.id]);
    const scoreMap = new Map<string, MatchScoreView>();
    for (const score of scoreResult.rows) {
      if (score.location !== 'home' && score.location !== 'away') continue;
      const item = scoreMap.get(String(score.description)) ?? { description: String(score.description), home: null, away: null };
      item[score.location] = numberOrNull(score.goals);
      scoreMap.set(item.description, item);
    }
    return { id: String(row.id), publicId: String(row.public_id), locale, competitionId: String(row.competition_id),
      competition: String(row.competition_name), competitionSlug: String(row.competition_slug), competitionType: String(row.competition_type),
      seasonId: row.season_id ? String(row.season_id) : null, season: row.season_name ? String(row.season_name) : row.stored_season_name ? String(row.stored_season_name) : null,
      round: row.round_name ? String(row.round_name) : null, stage: row.stage_name ? String(row.stage_name) : null,
      providerStageId: numberOrNull(row.provider_stage_id), providerGroupId: numberOrNull(row.provider_group_id),
      group: row.group_name ? String(row.group_name) : null, venue: row.venue_name ? String(row.venue_name) : null,
      venueCity: row.venue_city ? String(row.venue_city) : null, kickoff: new Date(String(row.kickoff)).toISOString(), status: row.status as FixtureStatus,
      home: { id: String(row.home_team_id), publicId: String(row.home_public_id), name: String(row.home_name), shortName: row.home_short ? String(row.home_short) : null, imageUrl: row.home_image ? String(row.home_image) : null },
      away: { id: String(row.away_team_id), publicId: String(row.away_public_id), name: String(row.away_name), shortName: row.away_short ? String(row.away_short) : null, imageUrl: row.away_image ? String(row.away_image) : null },
      homeScore: numberOrNull(row.home_score), awayScore: numberOrNull(row.away_score), scores: [...scoreMap.values()],
      providerUpdatedAt: iso(row.provider_updated_at) };
  }

  async moduleStates(fixtureId: string): Promise<Record<string, MatchModuleMeta>> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT module,state,provider_updated_at,last_success_at,snapshot_at
      FROM fixture_detail_sync_state WHERE fixture_id=$1`, [fixtureId]);
    return Object.fromEntries(result.rows.map(row => [String(row.module), { state: row.state as MatchModuleState,
      providerUpdatedAt: iso(row.provider_updated_at), lastSuccessfulRefreshAt: iso(row.last_success_at), snapshotAt: iso(row.snapshot_at) }]));
  }

  async events(fixtureId: string): Promise<MatchEventView[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT fe.provider_event_id,fe.event_type,fe.period_id,fe.minute,fe.extra_minute,fe.team_id,
      fe.player_name,fe.related_player_name,fe.result,fe.detail,fe.rescinded,p.public_id AS player_public_id,rp.public_id AS related_player_public_id
      FROM fixture_events fe LEFT JOIN players p ON p.id=fe.player_entity_id LEFT JOIN players rp ON rp.id=fe.related_player_entity_id WHERE fe.fixture_id=$1
      ORDER BY minute NULLS LAST,COALESCE(extra_minute,0),sort_order NULLS LAST,provider_event_id`, [fixtureId]);
    return result.rows.map(row => ({ id: String(row.provider_event_id), type: String(row.event_type), periodId: numberOrNull(row.period_id),
      minute: numberOrNull(row.minute), extraMinute: numberOrNull(row.extra_minute), teamId: row.team_id ? String(row.team_id) : null,
      playerName: row.player_name ? String(row.player_name).trim() : null, relatedPlayerName: row.related_player_name ? String(row.related_player_name).trim() : null,
      result: row.result ? String(row.result) : null, playerPublicId: row.player_public_id ? String(row.player_public_id) : null,
      relatedPlayerPublicId: row.related_player_public_id ? String(row.related_player_public_id) : null,
      detail: row.detail ? String(row.detail) : null, rescinded: Boolean(row.rescinded) }));
  }

  async statistics(fixtureId: string): Promise<MatchStatisticView[]> {
    const result = await this.database.query<Record<string, unknown>>(`SELECT statistic_type,location,value_numeric,value_text,unit,period_scope
      FROM fixture_statistics WHERE fixture_id=$1 ORDER BY statistic_type,location`, [fixtureId]);
    const values = new Map<string, MatchStatisticView>();
    for (const row of result.rows) {
      const key = `${row.statistic_type}:${row.period_scope}`;
      const item = values.get(key) ?? { type: String(row.statistic_type), home: null, away: null, unit: row.unit ? String(row.unit) : null, scope: String(row.period_scope) };
      const value = row.value_numeric !== null ? Number(row.value_numeric) : row.value_text !== null ? String(row.value_text) : null;
      if (row.location === 'home') item.home = value;
      if (row.location === 'away') item.away = value;
      values.set(key, item);
    }
    return [...values.values()];
  }

  async lineups(fixtureId: string): Promise<MatchLineupTeamView[]> {
    const [players, context, statisticRows] = await Promise.all([
      this.database.query<Record<string, unknown>>(`SELECT fl.provider_lineup_id,fl.player_entity_id,fl.team_id,fl.player_name,fl.lineup_type,fl.position_id,fl.formation_field,fl.jersey_number,fl.unlinked_statistics,
        p.public_id AS player_public_id FROM fixture_lineups fl LEFT JOIN players p ON p.id=fl.player_entity_id WHERE fl.fixture_id=$1
        ORDER BY fl.team_id,fl.lineup_type,fl.formation_position NULLS LAST,fl.jersey_number NULLS LAST`, [fixtureId]),
      this.database.query<Record<string, unknown>>(`SELECT team_id,formation,NULL::text AS coach FROM fixture_formations WHERE fixture_id=$1
        UNION ALL SELECT team_id,NULL::text AS formation,coach_name AS coach FROM fixture_coaches WHERE fixture_id=$1`, [fixtureId]),
      this.database.query<Record<string, unknown>>(`SELECT fps.player_id,st.developer_name,st.name,fps.value FROM fixture_player_statistics fps
        JOIN profile_statistic_types st ON st.provider='SPORTMONKS' AND st.provider_type_id=fps.provider_type_id WHERE fps.fixture_id=$1
        AND st.developer_name IN ('MINUTES_PLAYED','GOALS','ASSISTS','YELLOWCARDS','REDCARDS','SHOTS_TOTAL','SHOTS_ON_TARGET','SAVES','PASSES','RATING')
        ORDER BY fps.player_id,fps.provider_type_id`,[fixtureId]),
    ]);
    const playerStats=new Map<string,Array<{code:string;label:string;value:number|string}>>();
    for(const row of statisticRows.rows){const value=playerStatisticValue(String(row.developer_name),row.value);
      if(value===null)continue;const key=String(row.player_id);
      playerStats.set(key,[...(playerStats.get(key)??[]),{code:String(row.developer_name),label:String(row.name),value}]);}
    const teams = new Map<string, MatchLineupTeamView>();
    const get = (id: string) => { const found = teams.get(id) ?? { teamId: id, formation: null, coach: null, starters: [], substitutes: [] }; teams.set(id, found); return found; };
    for (const row of context.rows) { const team = get(String(row.team_id)); if (row.formation) team.formation = String(row.formation); if (row.coach) team.coach = String(row.coach); }
    for (const row of players.rows) {
      const team = get(String(row.team_id));
      const unlinkedStatistics=(Array.isArray(row.unlinked_statistics)?row.unlinked_statistics:[]).flatMap(detail=>{
        if(!detail||typeof detail!=='object'||!detail.type||typeof detail.type.developer_name!=='string')return [];
        const code=detail.type.developer_name,value=playerStatisticValue(code,detail.value??detail.data);
        return value===null?[]:[{code,label:String(detail.type.name??code),value}];
      });
      const player = { id: String(row.provider_lineup_id), playerPublicId: row.player_public_id ? String(row.player_public_id) : null,
        teamId: String(row.team_id), name: String(row.player_name).trim(),
        starter: row.lineup_type === 'STARTER', positionId: numberOrNull(row.position_id), formationField: row.formation_field ? String(row.formation_field) : null,
        jerseyNumber: numberOrNull(row.jersey_number), statistics: row.player_entity_id ? playerStats.get(String(row.player_entity_id)) ?? [] : unlinkedStatistics };
      (player.starter ? team.starters : team.substitutes).push(player);
    }
    return [...teams.values()];
  }

  async playerPerformances(fixtureId: string): Promise<MatchPlayerPerformanceView[]> {
    const result=await this.database.query<Record<string,unknown>>(`SELECT fps.player_id,p.public_id,p.display_name,fps.team_id,t.name AS team_name,
      st.developer_name,st.name AS statistic_name,fps.value FROM fixture_player_statistics fps
      JOIN players p ON p.id=fps.player_id JOIN teams t ON t.id=fps.team_id JOIN profile_statistic_types st
        ON st.provider='SPORTMONKS' AND st.provider_type_id=fps.provider_type_id
      WHERE fps.fixture_id=$1 AND st.developer_name IN
        ('MINUTES_PLAYED','MINUTES','GOALS','ASSISTS','YELLOWCARDS','REDCARDS','SHOTS','SHOTS_TOTAL','SHOTS_ON_TARGET','SAVES','PASSES','RATING')
      ORDER BY fps.team_id,p.display_name,fps.provider_type_id`,[fixtureId]);
    const players=new Map<string,MatchPlayerPerformanceView>();
    for(const row of result.rows){const value=playerStatisticValue(String(row.developer_name),row.value);
      if(value===null)continue;
      const id=String(row.player_id);const player=players.get(id)??{playerId:id,playerPublicId:String(row.public_id),
        player:String(row.display_name),teamId:String(row.team_id),team:String(row.team_name),statistics:[]};
      player.statistics.push({code:String(row.developer_name),label:String(row.statistic_name),value});players.set(id,player);
    }
    return [...players.values()].filter(player=>player.statistics.length>0);
  }

  async standings(header: MatchHeaderView): Promise<MatchStandingView[]> {
    if (!header.seasonId) return [];
    const result = await this.database.query<Record<string, unknown>>(`SELECT sc.*,t.public_id AS team_public_id,t.name AS team_name FROM standings_current sc JOIN teams t ON t.id=sc.team_id
      WHERE sc.season_id=$1 AND ($2::bigint IS NULL OR sc.stage_id=$2) AND ($3::bigint IS NULL OR sc.group_id=$3)
      ORDER BY sc.position`, [header.seasonId, header.providerStageId, header.providerGroupId]);
    return result.rows.map(row => ({ teamId: String(row.team_id), teamPublicId: String(row.team_public_id), team: String(row.team_name), position: Number(row.position),
      played: numberOrNull(row.played), won: numberOrNull(row.won), drawn: numberOrNull(row.drawn), lost: numberOrNull(row.lost),
      goalsFor: numberOrNull(row.goals_for), goalsAgainst: numberOrNull(row.goals_against), goalDifference: numberOrNull(row.goal_difference),
      points: numberOrNull(row.points), highlighted: row.team_id === header.home.id || row.team_id === header.away.id }));
  }

  async form(header: MatchHeaderView): Promise<MatchFormView> {
    const result = await this.database.query<Record<string, unknown>>(`WITH history AS (
      (SELECT * FROM fixtures WHERE status='FINISHED' AND kickoff<$2 AND (home_team_id=($1::uuid[])[1] OR away_team_id=($1::uuid[])[1]) ORDER BY kickoff DESC,id LIMIT 20)
      UNION
      (SELECT * FROM fixtures WHERE status='FINISHED' AND kickoff<$2 AND (home_team_id=($1::uuid[])[2] OR away_team_id=($1::uuid[])[2]) ORDER BY kickoff DESC,id LIMIT 20)
      UNION
      (SELECT * FROM fixtures WHERE status='FINISHED' AND kickoff<$2 AND home_team_id=ANY($1::uuid[]) AND away_team_id=ANY($1::uuid[]) ORDER BY kickoff DESC,id LIMIT 30)
      ) SELECT f.id,f.public_id,f.kickoff,f.status,f.home_score,f.away_score,f.home_team_id,f.away_team_id,ht.name AS home,at.name AS away
      FROM history f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id ORDER BY f.kickoff DESC,f.id`, [[header.home.id, header.away.id], header.kickoff]);
    const make = (row: Record<string, unknown>, teamId: string): MatchHistoryView => {
      const homeScore = numberOrNull(row.home_score); const awayScore = numberOrNull(row.away_score); const isHome = row.home_team_id === teamId;
      const mine = isHome ? homeScore : awayScore; const theirs = isHome ? awayScore : homeScore;
      return { id: String(row.id), publicId: String(row.public_id), kickoff: new Date(String(row.kickoff)).toISOString(), home: String(row.home), away: String(row.away),
        homeScore, awayScore, status: row.status as FixtureStatus, perspective: mine === null || theirs === null ? null : mine > theirs ? 'W' : mine < theirs ? 'L' : 'D' };
    };
    const prior = result.rows.filter(row => row.id !== header.id);
    const home = prior.filter(row => row.home_team_id === header.home.id || row.away_team_id === header.home.id).slice(0, 20).map(row => make(row, header.home.id));
    const away = prior.filter(row => row.home_team_id === header.away.id || row.away_team_id === header.away.id).slice(0, 20).map(row => make(row, header.away.id));
    const headToHead = prior.filter(row => [row.home_team_id, row.away_team_id].includes(header.home.id) && [row.home_team_id, row.away_team_id].includes(header.away.id)).slice(0, 30).map(row => make(row, header.home.id));
    return { home, away, headToHead };
  }

  async odds(header: MatchHeaderView, geo: CommercialGeo | null): Promise<MatchOddsPriceView[]> {
    if (!geo || !isPregameActionable(header.kickoff)) return [];
    const countryCode = geo;
    const result = await this.database.query<Record<string, unknown>>(`SELECT b.display_name,o.market_code,o.outcome_code,o.line,o.decimal_odds,
      o.provider_updated_at,(bga.affiliate_enabled AND al.enabled AND b.affiliate_status='ACTIVE') AS affiliate_eligible,
      CASE WHEN bga.affiliate_enabled AND al.enabled AND b.affiliate_status='ACTIVE' THEN al.destination_url END AS affiliate_url
      FROM odds_current o JOIN bookmakers b ON b.id=o.bookmaker_id JOIN countries co ON co.iso2=$2
      LEFT JOIN bookmaker_geo_availability bga ON bga.bookmaker_id=b.id AND bga.country_id=co.id
      LEFT JOIN affiliate_links al ON al.bookmaker_id=b.id AND al.country_id=co.id
      WHERE o.fixture_id=$1 AND o.status='ACTIVE' AND o.market_code IN ('MATCH_WINNER','TOTAL_GOALS','BTTS')
      AND (o.market_code<>'TOTAL_GOALS' OR o.line=2.5) AND o.provider_updated_at >= now()-interval '30 minutes'
      AND bga.odds_enabled IS TRUE AND bga.verified_at IS NOT NULL
      ORDER BY o.market_code,o.outcome_code,o.decimal_odds DESC`, [header.id, countryCode]);
    return result.rows.map(row => ({ bookmaker: String(row.display_name), market: String(row.market_code), outcome: String(row.outcome_code),
      line: numberOrNull(row.line), decimalOdds: Number(row.decimal_odds), providerUpdatedAt: new Date(String(row.provider_updated_at)).toISOString(),
      affiliateEligible: Boolean(row.affiliate_eligible), affiliateUrl: row.affiliate_url ? String(row.affiliate_url) : null }));
  }

  async sitemapFixtures(limit = 100): Promise<Array<{ publicId: string; home: string; away: string; updatedAt: Date }>> {
    return (await new SportsSitemapRepository(this.database).entries('matches',limit)).map(row=>({publicId:row.publicId,home:row.name,away:row.away!,updatedAt:new Date(row.updatedAt)}));
  }
}
