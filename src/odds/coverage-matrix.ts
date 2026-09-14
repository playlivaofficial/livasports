import type {QueryExecutor} from '@/database/client';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {KICKOFF_TOLERANCE_MS, type CanonicalOddsFixture, type OddsSnapshot, type ProviderOddsFixture} from './types';
import {matchOddsFixture, namesMatch} from './matching';
import {M5_REJECTED_TOURNAMENTS,M5_TOURNAMENTS} from '@/providers/oddspapi/m5-normalizer';
import {resolveCatalogTournaments, schedulerTournaments} from '@/providers/oddspapi/tournament-catalog';
import {budgetHealth} from './budget';

export function coverageGapCode(reason:string,context:{tournamentActive?:boolean;hasQuote?:boolean;stale?:boolean;readModelDropped?:boolean}={}):string {
  if(context.readModelDropped)return 'QUOTE_DROPPED_BY_READ_MODEL';
  if(context.stale)return 'QUOTE_STALE';
  if(context.hasQuote===false&&context.tournamentActive===false)return 'TOURNAMENT_NOT_ACTIVE';
  if(reason==='provider fixture absent')return context.tournamentActive===false?'TOURNAMENT_NOT_ACTIVE':'ODDSPAPI_FIXTURE_ABSENT';
  if(reason==='team mismatch')return 'TEAM_ALIAS_MISMATCH';
  if(reason==='kickoff mismatch')return 'KICKOFF_MISMATCH';
  if(reason==='mapping missing for another reason'||reason==='duplicate candidate')return 'FIXTURE_MAPPING_MISSING';
  if(context.hasQuote===false)return 'BOOKMAKER_DOES_NOT_PRICE';
  return 'OTHER';
}

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

async function competitionGapRows(db: QueryExecutor, slug: string) {
  return db.query(`SELECT f.id, f.public_id, f.kickoff, ht.name AS home, at.name AS away, f.status,
      EXISTS(SELECT 1 FROM odds_mapping_reviews mr WHERE mr.fixture_id=f.id AND mr.state IN ('EXACT','HIGH_CONFIDENCE')) AS mapped
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.slug=$1
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE f.status='SCHEDULED' AND f.kickoff>now()
      ORDER BY f.kickoff`, [slug]);
}

async function latestTournamentSnapshots(db: QueryExecutor, tournamentId: string) {
  return db.query(`SELECT DISTINCT ON (bookmaker) bookmaker, observed_at, payload FROM odds_sync_snapshots
      WHERE applied_at IS NOT NULL AND payload->'tournamentIds' @> $1::jsonb
      ORDER BY bookmaker, observed_at DESC`, [JSON.stringify([tournamentId])]);
}

function gapFromRows(slug: string, rows: readonly Record<string, unknown>[], providerFixtures: readonly ProviderOddsFixture[]) {
  return rows.filter(row => !row.mapped).map(row => {
    const fixture: CanonicalOddsFixture = {
      id: String(row.id), competition: slug, competitionId: '', sport: 'FOOTBALL',
      kickoff: row.kickoff instanceof Date ? row.kickoff.toISOString() : String(row.kickoff),
      status: String(row.status), home: String(row.home), away: String(row.away), homeId: '', awayId: '',
    };
    return {
      publicId: row.public_id ? String(row.public_id) : null,
      home: fixture.home,
      away: fixture.away,
      kickoff: fixture.kickoff,
      reason: unmappedFixtureReason(fixture, providerFixtures),
    };
  });
}

export async function inspectStoredTournament(db: QueryExecutor, canonical: string, tournamentId: string) {
  const [upcoming, snapshots, quotes] = await Promise.all([
    competitionGapRows(db, canonical),
    latestTournamentSnapshots(db, tournamentId),
    db.query(`SELECT f.public_id, ht.name AS home, at.name AS away, f.kickoff,
        count(DISTINCT o.id) FILTER (WHERE b.provider_slug='betsson' AND o.market_code='MATCH_WINNER' AND o.status='ACTIVE')::int AS betsson_mw,
        count(DISTINCT o.id) FILTER (WHERE b.provider_slug='betano.bet.br' AND o.market_code='MATCH_WINNER' AND o.status='ACTIVE')::int AS betano_mw
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id AND c.slug=$1
      JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      LEFT JOIN odds_current o ON o.fixture_id=f.id AND o.scope='FULL_TIME_REGULATION' AND o.phase='PREGAME'
      LEFT JOIN bookmakers b ON b.id=o.bookmaker_id
      WHERE f.status='SCHEDULED' AND f.kickoff>now()
      GROUP BY f.id, f.public_id, ht.name, at.name, f.kickoff
      ORDER BY f.kickoff`, [canonical]),
  ]);
  const providerFixtures = snapshots.rows.flatMap(row => {
    const payload = row.payload as OddsSnapshot;
    return (payload.fixtures ?? []).filter(fixture => fixture.competition === canonical).map(fixture => ({bookmaker: String(row.bookmaker), observedAt: row.observed_at, ...fixture}));
  });
  return {
    canonical,
    tournamentId,
    snapshotObservedAt: snapshots.rows.map(row => ({bookmaker: row.bookmaker, observedAt: row.observed_at})),
    upcoming: upcoming.rows.length,
    mapped: upcoming.rows.filter(row => row.mapped).length,
    providerFixtures: providerFixtures.map(row => ({
      bookmaker: row.bookmaker,
      home: row.homeNames,
      away: row.awayNames,
      kickoff: row.kickoff,
    })),
    unmapped: gapFromRows(canonical, upcoming.rows, providerFixtures),
    quotes: quotes.rows.map(row => ({
      publicId: row.public_id,
      home: row.home,
      away: row.away,
      kickoff: row.kickoff instanceof Date ? row.kickoff.toISOString() : String(row.kickoff),
      betssonMw: Number(row.betsson_mw),
      betanoMw: Number(row.betano_mw),
    })),
  };
}

export async function buildCoverageMatrix(db: QueryExecutor) {
  const [catalogRow, budget, health, reviews, competitions, ligaMx, serieB, ligaMxSnapshots, serieBSnapshots] = await Promise.all([
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
    competitionGapRows(db, 'liga-mx'),
    competitionGapRows(db, 'brasileirao-serie-b'),
    latestTournamentSnapshots(db, '27464'),
    latestTournamentSnapshots(db, '390'),
  ]);
  const catalog = catalogRow.rows[0];
  const resolved = resolveCatalogTournaments(catalog?.tournaments ?? []);
  const scheduled = schedulerTournaments(catalog?.tournaments ?? []);
  const byCanonical = new Map(resolved.map(row => [row.canonical, row]));
  const scheduledIds = new Set(scheduled.map(row => row.id));
  const stableIds = new Set<string>(M5_TOURNAMENTS.map(row => row.id));
  const ligaMxProvider = ligaMxSnapshots.rows.flatMap(row => (row.payload as OddsSnapshot).fixtures ?? []);
  const serieBProvider = serieBSnapshots.rows.flatMap(row => (row.payload as OddsSnapshot).fixtures ?? []);
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
      const rejected = M5_REJECTED_TOURNAMENTS.find(row => row.id === tournament.id);
      disabledReason = rejected
        ? `catalog-verified; singleton canary ${rejected.reason}; not scheduled`
        : Number(row.upcoming) === 0
          ? 'catalog-verified; no current LivaSports upcoming fixtures; canary deferred'
          : 'catalog-verified; not yet canaried into the scheduler allowlist';
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
      liveOddsCoverage:'PLAN-BLOCKED',
      disabledReason,
    };
  });
  return {
    at: new Date().toISOString(),
    budget,
    scheduler: health.rows[0] ?? null,
    matching: reviews.rows,
    resolved: resolved.map(row => ({id: row.id, slug: row.slug, category: row.category, canonical: row.canonical})),
    schedulerTournaments: scheduled.map(row => row.id),
    rows,
    ligaMxGap: gapFromRows('liga-mx', ligaMx.rows, ligaMxProvider),
    ligaMxSnapshotAt: ligaMxSnapshots.rows.map(row => ({bookmaker: row.bookmaker, observedAt: row.observed_at})),
    serieBGap: gapFromRows('brasileirao-serie-b', serieB.rows, serieBProvider),
    serieBSnapshotAt: serieBSnapshots.rows.map(row => ({bookmaker: row.bookmaker, observedAt: row.observed_at})),
  };
}
