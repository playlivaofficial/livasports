import type {QueryExecutor} from '@/database/client';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {KICKOFF_TOLERANCE_MS, type CanonicalOddsFixture, type OddsSnapshot, type ProviderOddsFixture} from './types';
import {matchOddsFixture, namesMatch} from './matching';
import {M5_TOURNAMENTS} from '@/providers/oddspapi/m5-normalizer';
import {resolveCatalogTournaments, schedulerTournaments} from '@/providers/oddspapi/tournament-catalog';
import {budgetHealth} from './budget';

export function unmappedFixtureReason(fixture: CanonicalOddsFixture, providerFixtures: readonly ProviderOddsFixture[]): string {
  const pool = providerFixtures.filter(row => row.competition === fixture.competition);
  if (!pool.length) return 'provider fixture absent';
  const named = pool.filter(row => namesMatch(row.homeNames, fixture.home, fixture.competition) && namesMatch(row.awayNames, fixture.away, fixture.competition));
  if (!named.length) {
    const nearKickoff = pool.filter(row => Number.isFinite(Date.parse(row.kickoff)) && Number.isFinite(Date.parse(fixture.kickoff))
      && Math.abs(Date.parse(row.kickoff) - Date.parse(fixture.kickoff)) <= KICKOFF_TOLERANCE_MS);
    const oneTeam = nearKickoff.filter(row => namesMatch(row.homeNames, fixture.home, fixture.competition) || namesMatch(row.awayNames, fixture.away, fixture.competition)
      || namesMatch(row.homeNames, fixture.away, fixture.competition) || namesMatch(row.awayNames, fixture.home, fixture.competition));
    return oneTeam.length ? 'team mismatch' : 'provider fixture absent';
  }
  const timed = named.filter(row => Number.isFinite(Date.parse(row.kickoff)) && Math.abs(Date.parse(fixture.kickoff) - Date.parse(row.kickoff)) <= KICKOFF_TOLERANCE_MS);
  if (!timed.length) return 'kickoff mismatch';
  if (timed.length > 1) return 'duplicate candidate';
  const matched = matchOddsFixture(timed[0], [fixture], []);
  if (matched.state === 'HIGH_CONFIDENCE' || matched.state === 'EXACT') return 'mapping missing for another reason';
  if (matched.state === 'TIME_MISMATCH') return 'kickoff mismatch';
  if (matched.state === 'AMBIGUOUS') return 'duplicate candidate';
  if (matched.state === 'TEAM_MISMATCH') return 'team mismatch';
  return matched.reason || matched.state;
}

export async function buildCoverageMatrix(db: QueryExecutor) {
  const [catalogRow, budget, health, reviews, competitions, ligaMx, snapshots] = await Promise.all([
    db.query("SELECT markets, tournaments FROM odds_provider_catalog WHERE provider='ODDSPAPI'"),
    budgetHealth(db),
    db.query('SELECT state, last_error, last_refresh_at, last_automatic_refresh_at, last_automatic_invocation_at, next_due_at, feeds_refreshed FROM odds_scheduler_health WHERE id=true'),
    db.query(`SELECT c.slug, mr.state, count(*)::int AS n FROM odds_mapping_reviews mr
      LEFT JOIN fixtures f ON f.id=mr.fixture_id LEFT JOIN competitions c ON c.id=f.competition_id
      GROUP BY c.slug, mr.state ORDER BY 1, 2`),
    db.query(`SELECT c.slug, c.name, c.enabled,
      (SELECT sm.provider_entity_id FROM provider_entity_mappings sm
        WHERE sm.provider='SPORTMONKS' AND sm.entity_type='COMPETITION' AND sm.livasports_entity_id=c.id LIMIT 1) AS sportmonks_id,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now())::int AS upcoming,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND EXISTS(
        SELECT 1 FROM odds_mapping_reviews mr WHERE mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')))::int AS mapped,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND o.status='ACTIVE' AND b.provider_slug='betsson' AND o.market_code='MATCH_WINNER')::int AS betsson_mw,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND o.status='ACTIVE' AND b.provider_slug='betano.bet.br' AND o.market_code='MATCH_WINNER')::int AS betano_mw,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND o.status='ACTIVE' AND b.provider_slug='betsson' AND o.market_code='TOTAL_GOALS' AND o.line=2.5)::int AS betsson_ou,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND o.status='ACTIVE' AND b.provider_slug='betano.bet.br' AND o.market_code='TOTAL_GOALS' AND o.line=2.5)::int AS betano_ou,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND o.status='ACTIVE' AND b.provider_slug='betsson' AND o.market_code='BTTS')::int AS betsson_btts,
      count(DISTINCT f.id) FILTER (WHERE f.status='SCHEDULED' AND f.kickoff>now() AND o.status='ACTIVE' AND b.provider_slug='betano.bet.br' AND o.market_code='BTTS')::int AS betano_btts
      FROM competitions c
      LEFT JOIN fixtures f ON f.competition_id=c.id
      LEFT JOIN odds_current o ON o.fixture_id=f.id AND o.scope='FULL_TIME_REGULATION' AND o.phase='PREGAME'
      LEFT JOIN bookmakers b ON b.id=o.bookmaker_id
      WHERE c.enabled
      GROUP BY c.id, c.slug, c.name, c.enabled
      ORDER BY c.name`),
    db.query(`SELECT f.id, f.kickoff, ht.name AS home, at.name AS away, f.status,
      EXISTS(SELECT 1 FROM odds_mapping_reviews mr WHERE mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')) AS mapped
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.slug='liga-mx'
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE f.status='SCHEDULED' AND f.kickoff>now()
      ORDER BY f.kickoff`),
    db.query(`SELECT DISTINCT ON (bookmaker) bookmaker, payload FROM odds_sync_snapshots
      WHERE applied_at IS NOT NULL AND payload->'tournamentIds' @> '["27464"]'::jsonb
      ORDER BY bookmaker, observed_at DESC`),
  ]);
  const catalog = catalogRow.rows[0];
  const resolved = resolveCatalogTournaments(catalog?.tournaments ?? []);
  const scheduled = schedulerTournaments(catalog?.tournaments ?? []);
  const byCanonical = new Map(resolved.map(row => [row.canonical, row]));
  const scheduledIds = new Set(scheduled.map(row => row.id));
  const stableIds = new Set<string>(M5_TOURNAMENTS.map(row => row.id));
  const providerFixtures = snapshots.rows.flatMap(row => (row.payload as OddsSnapshot).fixtures ?? []);
  const rows = competitions.rows.map(row => {
    const target = FOOTBALL_COMPETITION_TARGETS.find(item => item.slug === row.slug);
    const tournament = byCanonical.get(row.slug);
    const schedulerEnabled = tournament ? scheduledIds.has(tournament.id) : false;
    let verificationState = 'UNVERIFIED';
    let verificationSource = 'no unique OddsPapi catalog match';
    let disabledReason: string | null = 'no unique OddsPapi tournament identity';
    if (tournament && stableIds.has(tournament.id)) {
      verificationState = 'VERIFIED_STABLE';
      verificationSource = `OddsPapi catalog unique ${tournament.slug}/${tournament.category} id ${tournament.id}; production baseline`;
      disabledReason = null;
    } else if (tournament && schedulerEnabled) {
      verificationState = 'VERIFIED_CANARY';
      verificationSource = `OddsPapi catalog unique ${tournament.slug}/${tournament.category} id ${tournament.id}; singleton canary`;
      disabledReason = Number(row.mapped) > 0 ? null : 'verified ID but no current fixture mapping';
    } else if (tournament) {
      verificationState = 'VERIFIED_CATALOG';
      verificationSource = `OddsPapi catalog unique ${tournament.slug}/${tournament.category} id ${tournament.id}`;
      disabledReason = 'catalog-verified; not yet canaried into the scheduler allowlist';
    } else if (!target?.enabled) {
      disabledReason = 'competition disabled';
    }
    return {
      competition: row.name,
      slug: row.slug,
      sportmonksCompetitionId: row.sportmonks_id ?? null,
      oddspapiTournamentId: tournament?.id ?? null,
      verificationState,
      verificationSource,
      upcoming: Number(row.upcoming),
      mapped: Number(row.mapped),
      betsson: {matchWinner: Number(row.betsson_mw), totalGoals25: Number(row.betsson_ou), btts: Number(row.betsson_btts)},
      betano: {matchWinner: Number(row.betano_mw), totalGoals25: Number(row.betano_ou), btts: Number(row.betano_btts)},
      schedulerEnabled,
      disabledReason,
    };
  });
  const ligaMxGap = ligaMx.rows.filter(row => !row.mapped).map(row => {
    const fixture: CanonicalOddsFixture = {
      id: String(row.id), competition: 'liga-mx', competitionId: '', sport: 'FOOTBALL',
      kickoff: row.kickoff instanceof Date ? row.kickoff.toISOString() : String(row.kickoff),
      status: String(row.status), home: String(row.home), away: String(row.away), homeId: '', awayId: '',
    };
    return {home: fixture.home, away: fixture.away, kickoff: fixture.kickoff, reason: unmappedFixtureReason(fixture, providerFixtures)};
  });
  return {
    at: new Date().toISOString(),
    budget,
    scheduler: health.rows[0] ?? null,
    matching: reviews.rows,
    resolved: resolved.map(row => ({id: row.id, slug: row.slug, category: row.category, canonical: row.canonical})),
    schedulerTournaments: scheduled.map(row => row.id),
    rows,
    ligaMxGap,
  };
}
