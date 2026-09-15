import type { CacheCoordinator } from '@/cache/cache';
import { DEFAULT_CACHE_TTLS, type CacheTtlPolicy } from '@/cache/ttl-policy';
import { getDictionary, type PageKey, type SiteLocale } from '@/config/i18n';
import { V1_BOOKMAKERS } from '@/domain/catalog';
import type { Competition, Fixture, OddsQuote, Team } from '@/domain/entities';
import { FixtureStatus, MarketCode, OddsQuoteStatus } from '@/domain/enums';
import type { OddsFixtureMatchCandidate, OddsProvider } from '@/providers/contracts/OddsProvider';
import type { SportsDataProvider } from '@/providers/contracts/SportsDataProvider';
import { SafeProviderError } from '@/providers/safe-error';
import { deliveryWindow } from './time';
import { filterFixturesForPage, groupFixtureViews, stableSortFixtures } from './fixtures';
import type { FixtureView, M2PageData, MarketOddsView, ProviderState } from './types';

interface CanonicalResolvedFixture { fixture: Fixture; competition: Competition; homeTeam: Team; awayTeam: Team; }
interface SportsSnapshot { fixtures: CanonicalResolvedFixture[]; competitions: Competition[]; partial: boolean; fetchedAt: Date; }

const notConfigured = (): ProviderState => ({ state: 'not-configured', freshness: 'unavailable', reason: 'credentials-missing' });
const unavailable = (): ProviderState => ({ state: 'unavailable', freshness: 'unavailable', reason: 'provider-error' });

export interface M2DeliveryOptions {
  cacheTtls?: CacheTtlPolicy;
  oddsStaleAfterSeconds?: number;
  now?: () => Date;
  onDiagnostic?: (event: Readonly<Record<string, unknown>>) => void;
}

export class M2DataDeliveryService {
  private readonly lastSports = new Map<string, SportsSnapshot>();
  private readonly ttls: CacheTtlPolicy;
  private readonly oddsStaleAfterSeconds: number;
  private readonly now: () => Date;
  private readonly onDiagnostic: (event: Readonly<Record<string, unknown>>) => void;

  constructor(
    private readonly sportsProvider: SportsDataProvider | null,
    private readonly oddsProvider: OddsProvider | null,
    private readonly cache: CacheCoordinator,
    options: M2DeliveryOptions = {},
  ) {
    this.ttls = options.cacheTtls ?? DEFAULT_CACHE_TTLS;
    this.oddsStaleAfterSeconds = options.oddsStaleAfterSeconds ?? 300;
    this.now = options.now ?? (() => new Date());
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
  }

  private providerFailure(provider: 'SPORTMONKS' | 'ODDSPAPI', error: unknown): void {
    this.onDiagnostic(error instanceof SafeProviderError
      ? { event: 'provider-failure', ...error.context }
      : { event: 'provider-failure', provider, message: 'Provider request failed' });
  }

  private async sportsSnapshot(locale: SiteLocale, page: PageKey, now: Date): Promise<{ snapshot: SportsSnapshot; stale: boolean } | null> {
    if (!this.sportsProvider) return null;
    const dictionary = getDictionary(locale);
    const window = deliveryWindow(locale, page, now);
    const key = `m2:sports:${locale}:${page}:${window.from.toISOString()}:${window.to.toISOString()}`;
    try {
      const snapshot = await this.cache.getOrLoad(key, page === 'live' ? this.ttls.scores : this.ttls.fixtures, async () => {
        const competitions = await this.cache.getOrLoad(`m2:competitions:${dictionary.countryCode}`, this.ttls.competitions,
          () => this.sportsProvider!.getCompetitions([dictionary.countryCode, dictionary.countryName]));
        const fixtures = competitions.length
          ? await this.sportsProvider!.getFixtures({ from: window.from, to: window.to, competitionIds: competitions.map(item => item.id) })
          : [];
        const teams: Team[] = [];
        let partial = false;
        const seasonIds = [...new Set(fixtures.flatMap(fixture => fixture.seasonId ? [fixture.seasonId] : []))];
        await Promise.all(seasonIds.map(async seasonId => {
          try {
            const rows = await this.cache.getOrLoad(`m2:teams:${seasonId}`, this.ttls.teams, () => this.sportsProvider!.getTeams(seasonId));
            teams.push(...rows);
          } catch { partial = true; }
        }));
        const competitionById = new Map(competitions.map(item => [item.id, item]));
        const teamById = new Map(teams.map(item => [item.id, item]));
        const resolved = fixtures.flatMap(fixture => {
          const competition = competitionById.get(fixture.competitionId);
          const homeTeam = teamById.get(fixture.homeTeamId);
          const awayTeam = teamById.get(fixture.awayTeamId);
          if (!competition || !homeTeam || !awayTeam) { partial = true; return []; }
          return [{ fixture, competition, homeTeam, awayTeam }];
        });
        return { fixtures: resolved, competitions, partial, fetchedAt: this.now() } satisfies SportsSnapshot;
      });
      this.lastSports.set(key, snapshot);
      return { snapshot, stale: false };
    } catch (error) {
      this.providerFailure('SPORTMONKS', error);
      const previous = this.lastSports.get(key);
      return previous ? { snapshot: previous, stale: true } : null;
    }
  }

  private quoteFreshness(quote: OddsQuote, now: Date): 'fresh' | 'stale' {
    return now.getTime() - quote.providerUpdatedAt.getTime() <= this.oddsStaleAfterSeconds * 1000 ? 'fresh' : 'stale';
  }

  private oddsViews(quotes: readonly OddsQuote[], now: Date): MarketOddsView[] {
    const supported = quotes.filter(quote => quote.status === OddsQuoteStatus.ACTIVE
      && (quote.market !== MarketCode.TOTAL_GOALS || quote.line === 2.5));
    const marketKeys = new Map<string, OddsQuote[]>();
    for (const quote of supported) {
      const key = `${quote.market}:${quote.line ?? 'none'}`;
      marketKeys.set(key, [...(marketKeys.get(key) ?? []), quote]);
    }
    const bookmakerName = new Map(V1_BOOKMAKERS.map(bookmaker => [bookmaker.id, bookmaker.displayName as 'Betano BR' | 'Betsson']));
    const bookmakerSlug = new Map(V1_BOOKMAKERS.map(bookmaker => [bookmaker.id, bookmaker.providerSlug]));
    return [...marketKeys.values()].map(rows => ({
      market: rows[0].market, line: rows[0].line,
      outcomes: [...new Set(rows.map(row => row.outcome))].map(outcome => ({
        outcome,
        prices: rows.filter(row => row.outcome === outcome).flatMap(row => {
          const bookmaker = bookmakerName.get(row.bookmakerId);
          const sourceBookmaker=bookmakerSlug.get(row.bookmakerId);
          return bookmaker&&sourceBookmaker ? [{ bookmaker, decimalOdds: row.decimalOdds, providerUpdatedAt: row.providerUpdatedAt.toISOString(), freshness: this.quoteFreshness(row, now),
            priceKind:'REAL' as const,targetBookmaker:sourceBookmaker,sourceBookmaker,sourceBookmakerName:bookmaker,sourceQuoteId:String(row.id),sourceObservedAt:row.receivedAt.toISOString() }] : [];
        }).sort((left, right) => left.bookmaker.localeCompare(right.bookmaker)),
      })),
    })).sort((left, right) => [MarketCode.MATCH_WINNER, MarketCode.TOTAL_GOALS, MarketCode.BTTS].indexOf(left.market)
      - [MarketCode.MATCH_WINNER, MarketCode.TOTAL_GOALS, MarketCode.BTTS].indexOf(right.market));
  }

  private fixtureView(row: CanonicalResolvedFixture, freshness: 'fresh' | 'stale', quotes: readonly OddsQuote[], oddsAvailable: boolean, now: Date): FixtureView {
    const odds = this.oddsViews(quotes.filter(quote => quote.fixtureId === row.fixture.id), now);
    const prices = odds.flatMap(market => market.outcomes.flatMap(outcome => outcome.prices));
    const freshBookmakers = new Set(prices.filter(price => price.freshness === 'fresh').map(price => price.bookmaker));
    const oddsState = !oddsAvailable ? 'unavailable' : freshBookmakers.size === 2 ? 'complete' : freshBookmakers.size === 1 ? 'partial'
      : prices.some(price => price.freshness === 'stale') ? 'stale' : 'none';
    return {
      id: row.fixture.id, competition: row.competition.name, homeTeam: row.homeTeam.name, awayTeam: row.awayTeam.name,
      kickoff: row.fixture.kickoff.toISOString(), status: row.fixture.status, homeScore: row.fixture.homeScore,
      awayScore: row.fixture.awayScore, freshness, odds, oddsState,
    };
  }

  async load(locale: SiteLocale, page: PageKey): Promise<M2PageData> {
    const now = this.now();
    const dictionary = getDictionary(locale);
    const base = { locale, page, currentDate: new Intl.DateTimeFormat(dictionary.locale, { dateStyle: 'full', timeZone: dictionary.timeZone }).format(now), timeZone: dictionary.timeZone };
    if (!this.sportsProvider) return { ...base, sportsData: notConfigured(), oddsData: this.oddsProvider ? unavailable() : notConfigured(), competitions: [], sections: [], paidOddsRequests: 0 };
    const loaded = await this.sportsSnapshot(locale, page, now);
    if (!loaded) return { ...base, sportsData: unavailable(), oddsData: this.oddsProvider ? unavailable() : notConfigured(), competitions: [], sections: [], paidOddsRequests: 0 };
    const filtered = stableSortFixtures(filterFixturesForPage(loaded.snapshot.fixtures.map(row => row.fixture), page, now, dictionary.timeZone));
    const byId = new Map(loaded.snapshot.fixtures.map(row => [row.fixture.id, row]));
    const resolved = filtered.flatMap(fixture => byId.get(fixture.id) ?? []);
    const eligible = resolved.filter(row => row.fixture.status === FixtureStatus.SCHEDULED);
    let quotes: OddsQuote[] = [];
    let oddsAvailable = Boolean(this.oddsProvider);
    let paidOddsRequests = 0;
    let oddsFailed = false;
    if (this.oddsProvider && eligible.length && page !== 'live') {
      const matchCandidates: OddsFixtureMatchCandidate[] = eligible.map(row => ({ fixtureId: row.fixture.id, countryCode: dictionary.countryCode,
        competitionName: row.competition.name, homeTeamName: row.homeTeam.name, awayTeamName: row.awayTeam.name, kickoff: row.fixture.kickoff }));
      try {
        const batch = await this.oddsProvider.getPregameOdds({ fixtureIds: eligible.map(row => row.fixture.id), bookmakerSlugs: V1_BOOKMAKERS.map(item => item.providerSlug), fixtures: matchCandidates });
        quotes = batch.quotes;
        paidOddsRequests = batch.providerRequests;
        this.onDiagnostic({ event: 'provider-request-count', provider: 'ODDSPAPI', requests: batch.providerRequests });
      } catch (error) { this.providerFailure('ODDSPAPI', error); oddsAvailable = false; oddsFailed = true; }
    }
    const views = resolved.map(row => this.fixtureView(row, loaded.stale ? 'stale' : 'fresh', quotes, oddsAvailable, now));
    const freshPrices = views.flatMap(view => view.odds.flatMap(market => market.outcomes.flatMap(outcome => outcome.prices))).filter(price => price.freshness === 'fresh');
    const sportsData: ProviderState = loaded.stale ? { state: 'partial', freshness: 'stale', reason: 'provider-error' }
      : loaded.snapshot.partial ? { state: 'partial', freshness: 'fresh', reason: 'partial-coverage' }
        : { state: 'available', freshness: 'fresh', reason: views.length ? 'ok' : 'no-data' };
    const oddsData: ProviderState = !this.oddsProvider ? notConfigured() : oddsFailed ? unavailable()
      : { state: freshPrices.length ? (views.some(view => view.oddsState === 'partial') ? 'partial' : 'available') : 'available', freshness: freshPrices.length ? 'fresh' : 'unavailable', reason: freshPrices.length ? 'ok' : 'no-data' };
    return { ...base, sportsData, oddsData, competitions: [...new Set(resolved.map(row => row.competition.name))].sort(), sections: groupFixtureViews(views), paidOddsRequests };
  }
}
