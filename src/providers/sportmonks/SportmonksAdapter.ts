import { FOOTBALL, PRODUCT_COUNTRIES } from '@/domain/catalog';
import type { Country, LineupEntry, MatchEvent, MatchStatistic, StandingRow } from '@/domain/entities';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId, type CompetitionId, type FixtureId, type SeasonId } from '@/domain/ids';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { FixtureQuery, SportsDataProvider } from '@/providers/contracts/SportsDataProvider';
import type { FootballCompetitionTarget } from '@/config/footballCompetitions';
import type { CompetitionCatalog, FootballIngestionProvider, TeamCatalog } from '@/providers/contracts/FootballIngestionProvider';
import { SportmonksNormalizer } from './normalizer';
import type { SportmonksGateway, SportmonksTeamPayload } from './types';
import { classifyAccessibleCoverage } from '@/competition/coverage';
import { CompetitionCoverageStatus, TeamType } from '@/domain/enums';

async function mapBounded<T, R>(rows: readonly T[], mapper: (row: T) => Promise<R>, concurrency = 4): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < rows.length; index += concurrency) {
    results.push(...await Promise.all(rows.slice(index, index + concurrency).map(mapper)));
  }
  return results;
}

export class SportmonksAdapter implements SportsDataProvider, FootballIngestionProvider {
  private readonly normalizer: SportmonksNormalizer;
  private sportBinding: Promise<void> | null = null;
  private readonly countryBindings = new Map<number, Promise<Country | null>>();
  private readonly teamCountries = new Map<string, Promise<Country>>();

  constructor(
    private readonly gateway: SportmonksGateway,
    private readonly mappings: ProviderMappingService,
    private readonly resolveCountryByCode?: (code: string) => Promise<Country | null>,
  ) {
    this.normalizer = new SportmonksNormalizer(mappings);
  }

  private async providerId(type: ProviderEntityType, livasportsId: string): Promise<string> {
    const providerId = await this.mappings.lookupProviderId(ProviderCode.SPORTMONKS, type, livasportsId);
    if (!providerId) throw new Error(`No Sportmonks ${type} mapping exists for ${livasportsId}`);
    return providerId;
  }

  private async bindSportAndCountry(raw: { sport_id: number; country_id: number | null; country?: { iso2?: string; name?: string } }): Promise<Country | null> {
    this.sportBinding ??= this.mappings.bind(ProviderCode.SPORTMONKS, ProviderEntityType.SPORT,
      String(raw.sport_id), FOOTBALL.id, { code: FOOTBALL.code }).then(() => undefined);
    await this.sportBinding;
    if (raw.country_id === null || !raw.country?.iso2 || !raw.country.name) return null;
    const cached = this.countryBindings.get(raw.country_id);
    if (cached) return cached;
    const binding = (async () => {
      const code = raw.country!.iso2!.toUpperCase();
      const productCountry = code === 'BR' ? PRODUCT_COUNTRIES.BR : code === 'MX' ? PRODUCT_COUNTRIES.MX : null;
      const existing = await this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.COUNTRY, String(raw.country_id));
      const mappedCountry: Country | null = existing ? {
        id: domainId<'Country'>(existing.livasportsEntityId), code, name: raw.country!.name!,
      } : null;
      const country = productCountry ?? mappedCountry ?? await this.resolveCountryByCode?.(code) ?? {
        id: domainId<'Country'>(crypto.randomUUID()), code, name: raw.country!.name!,
      };
      await this.mappings.bind(ProviderCode.SPORTMONKS, ProviderEntityType.COUNTRY,
        String(raw.country_id), country.id, { code, name: country.name });
      return country;
    })();
    this.countryBindings.set(raw.country_id, binding);
    return binding;
  }

  private async canonicalTeamCountry(raw: SportmonksTeamPayload): Promise<Country | null> {
    if (raw.country_id === null || !raw.country?.iso2 || !raw.country.name) return null;
    if (!this.resolveCountryByCode) return this.bindSportAndCountry(raw);
    const code = raw.country.iso2.toUpperCase();
    const cached = this.teamCountries.get(code);
    if (cached) return cached;
    const binding = (async () => {
      const productCountry = code === 'BR' || code === 'MX' ? PRODUCT_COUNTRIES[code] : null;
      return productCountry ?? await this.resolveCountryByCode!(code) ?? {
        id: domainId<'Country'>(crypto.randomUUID()), code, name: raw.country!.name!,
      };
    })();
    this.teamCountries.set(code, binding);
    return binding;
  }

  private async normalizeTeamCatalog(rawTeams: readonly SportmonksTeamPayload[], teamType: TeamType): Promise<TeamCatalog> {
    const canonicalCountries = await mapBounded(rawTeams, raw => this.canonicalTeamCountry(raw));
    const normalized = await mapBounded(rawTeams, raw => this.normalizer.team({ ...raw, country_id: null }, teamType));
    const countries = new Map<string, Country>();
    const teams = normalized.map((team, index) => {
      const country = canonicalCountries[index];
      if (country) countries.set(country.id, country);
      return { ...team, countryId: country?.id ?? null };
    });
    return { countries: [...countries.values()], teams };
  }

  async discoverCompetitions(targets: readonly FootballCompetitionTarget[]): Promise<CompetitionCatalog> {
    // Ingestion order is not acquisition ranking and must not inherit BR priority.
    const enabled = targets.filter(target => target.enabled).sort((a, b) => a.slug.localeCompare(b.slug));
    const countries = new Map<string, Country>(Object.values(PRODUCT_COUNTRIES).map(country => [country.id, country]));
    const competitions: CompetitionCatalog['competitions'] = [];
    const coverage = classifyAccessibleCoverage(enabled, await this.gateway.competitions());
    for (const result of coverage) {
      if (result.classification !== CompetitionCoverageStatus.SUPPORTED || !result.providerCompetition) continue;
      const raw = result.providerCompetition;
      const country = await this.bindSportAndCountry(raw);
      if (country) countries.set(country.id, country);
      const competition = await this.normalizer.competition(raw);
      competition.slug = result.target.slug;
      competition.countryId = country?.id ?? null;
      await this.mappings.bind(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, String(raw.id), competition.id, {
        targetKey: result.target.key, providerName: raw.name, teamType: result.target.teamType, seasonStrategy: result.target.seasonStrategy,
        verifiedSportmonksId: result.target.sportmonksId ?? null,
        acquisitionEligible: result.target.approvedInventory === true && !result.target.parentSlug,
        parentSlug: result.target.parentSlug ?? null,
      });
      competitions.push({ targetKey: result.target.key, competition, target: result.target,
        coverageStatus: CompetitionCoverageStatus.SUPPORTED, providerName: raw.name });
    }
    return { sport: FOOTBALL, countries: [...countries.values()], competitions };
  }

  async getTeamCatalog(seasonId: SeasonId): Promise<TeamCatalog> {
    const providerId = await this.providerId(ProviderEntityType.SEASON, seasonId);
    const seasonMapping = await this.mappings.lookupByLivaSportsId(ProviderCode.SPORTMONKS, ProviderEntityType.SEASON, seasonId);
    const teamType = seasonMapping?.metadata.teamType === TeamType.NATIONAL_TEAM ? TeamType.NATIONAL_TEAM : TeamType.CLUB;
    const rawTeams = await this.gateway.teams(providerId);
    return this.normalizeTeamCatalog(rawTeams, teamType);
  }

  getRequestCount(): number { return this.gateway.requestCount(); }

  async getCompetitions(countryCodes?: readonly string[]) {
    return Promise.all((await this.gateway.competitions(countryCodes)).map(raw => this.normalizer.competition(raw)));
  }

  async getSeasons(competitionId: CompetitionId) {
    const providerId = await this.providerId(ProviderEntityType.COMPETITION, competitionId);
    const competitionMapping = await this.mappings.lookupByLivaSportsId(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, competitionId);
    const rows = await this.gateway.seasons(providerId);
    const seasons = await Promise.all(rows.map(raw => this.normalizer.season(raw)));
    await Promise.all(rows.map((raw, index) => this.mappings.bind(ProviderCode.SPORTMONKS, ProviderEntityType.SEASON,
      String(raw.id), seasons[index].id, { targetKey: competitionMapping?.metadata.targetKey,
        teamType: competitionMapping?.metadata.teamType, seasonStrategy: competitionMapping?.metadata.seasonStrategy })));
    return seasons;
  }

  async getTeams(seasonId: SeasonId) {
    const providerId = await this.providerId(ProviderEntityType.SEASON, seasonId);
    const seasonMapping = await this.mappings.lookupByLivaSportsId(ProviderCode.SPORTMONKS, ProviderEntityType.SEASON, seasonId);
    const teamType = seasonMapping?.metadata.teamType === TeamType.NATIONAL_TEAM ? TeamType.NATIONAL_TEAM : TeamType.CLUB;
    return (await this.normalizeTeamCatalog(await this.gateway.teams(providerId), teamType)).teams;
  }

  async getFixtures(query: FixtureQuery) {
    const competitionIds = query.competitionIds
      ? await Promise.all(query.competitionIds.map(id => this.providerId(ProviderEntityType.COMPETITION, id))) : undefined;
    return mapBounded(await this.gateway.fixtures(query.from, query.to, competitionIds), raw => this.normalizer.fixture(raw));
  }

  async getFixture(fixtureId: FixtureId) {
    const raw = await this.gateway.fixture(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    return raw ? this.normalizer.fixture(raw) : null;
  }

  async getScores(fixtureIds: readonly FixtureId[]) {
    const ids = await Promise.all(fixtureIds.map(id => this.providerId(ProviderEntityType.FIXTURE, id)));
    return mapBounded(await this.gateway.scores(ids), raw => this.normalizer.fixture(raw));
  }

  async getEvents(fixtureId: FixtureId): Promise<MatchEvent[]> {
    const rows = await this.gateway.events(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    const events: MatchEvent[] = [];
    for (const row of rows) {
      const value = row as unknown as Record<string, unknown>;
      const teamMapping = typeof value.participant_id === 'number'
        ? await this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.TEAM, String(value.participant_id)) : null;
      events.push({ fixtureId, type: String(value.type ?? value.name ?? 'UNKNOWN'), minute: typeof value.minute === 'number' ? value.minute : null,
        teamId: teamMapping ? domainId<'Team'>(teamMapping.livasportsEntityId) : null,
        detail: typeof value.detail === 'string' ? value.detail : null });
    }
    return events;
  }

  async getStandings(seasonId: SeasonId): Promise<StandingRow[]> {
    const rows = await this.gateway.standings(await this.providerId(ProviderEntityType.SEASON, seasonId));
    const standings: StandingRow[] = [];
    for (const row of rows) {
      const value = row as unknown as Record<string, unknown>;
      if (typeof value.participant_id !== 'number' || typeof value.league_id !== 'number' || typeof value.position !== 'number') continue;
      const [team, competition] = await Promise.all([
        this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.TEAM, String(value.participant_id)),
        this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, String(value.league_id)),
      ]);
      if (!team || !competition) continue;
      standings.push({ competitionId: domainId<'Competition'>(competition.livasportsEntityId), seasonId,
        teamId: domainId<'Team'>(team.livasportsEntityId), position: value.position,
        played: Number(value.played ?? 0), points: Number(value.points ?? 0) });
    }
    return standings;
  }

  async getLineups(fixtureId: FixtureId): Promise<LineupEntry[]> {
    const rows = await this.gateway.lineups(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    const lineups: LineupEntry[] = [];
    for (const row of rows) {
      const value = row as Record<string, unknown>;
      if (typeof value.player_name !== 'string' || typeof value.team_id !== 'number') continue;
      const team = await this.mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.TEAM, String(value.team_id));
      if (!team) continue;
      lineups.push({ fixtureId, teamId: domainId<'Team'>(team.livasportsEntityId), participantName: value.player_name,
        position: typeof value.position === 'string' ? value.position : null, starter: Boolean(value.starter) });
    }
    return lineups;
  }

  async getStatistics(fixtureId: FixtureId): Promise<MatchStatistic[]> {
    const rows = await this.gateway.statistics(await this.providerId(ProviderEntityType.FIXTURE, fixtureId));
    return rows.flatMap(row => {
      const value = row as Record<string, unknown>;
      if (typeof value.type !== 'string' || (typeof value.value !== 'string' && typeof value.value !== 'number')) return [];
      return [{ fixtureId, teamId: null, type: value.type, value: value.value }];
    });
  }

  async getHeadToHead(homeTeamId: string, awayTeamId: string) {
    const [home, away] = await Promise.all([
      this.providerId(ProviderEntityType.TEAM, homeTeamId), this.providerId(ProviderEntityType.TEAM, awayTeamId),
    ]);
    return Promise.all((await this.gateway.headToHead(home, away)).map(raw => this.normalizer.fixture(raw)));
  }
}
