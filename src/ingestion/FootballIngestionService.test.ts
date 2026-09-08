import { describe, expect, it } from 'vitest';
import type { FootballCompetitionTarget } from '@/config/footballCompetitions';
import { FOOTBALL, PRODUCT_COUNTRIES } from '@/domain/catalog';
import type { Competition, Fixture, Season, Team } from '@/domain/entities';
import { CompetitionType, FixtureStatus, ProviderCode, ProviderEntityType, TeamType } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import { ProviderMappingService } from '@/domain/provider-mapping';
import type { FootballIngestionProvider } from '@/providers/contracts/FootballIngestionProvider';
import type { FixtureQuery } from '@/providers/contracts/SportsDataProvider';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { RecordingCacheInvalidator } from '@/cache/invalidation';
import { DatabaseM2ReadService } from '@/delivery/DatabaseM2ReadService';
import { FootballIngestionService } from './FootballIngestionService';
import { InMemoryFootballIngestionStore } from './store';

const now = new Date('2026-09-07T18:00:00.000Z');
const competition: Competition = { id: domainId<'Competition'>('competition-id'), sportId: FOOTBALL.id,
  countryId: PRODUCT_COUNTRIES.BR.id, name: 'Brasileiro Serie A', slug: 'brasileiro-serie-a' };
const season: Season = { id: domainId<'Season'>('season-id'), competitionId: competition.id, name: '2026',
  startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-12-31T23:59:59Z'), isCurrent: true };
const teams: Team[] = [
  { id: domainId<'Team'>('home-id'), sportId: FOOTBALL.id, countryId: PRODUCT_COUNTRIES.BR.id, name: 'Home', shortName: 'H', imageUrl: null },
  { id: domainId<'Team'>('away-id'), sportId: FOOTBALL.id, countryId: PRODUCT_COUNTRIES.BR.id, name: 'Away', shortName: 'A', imageUrl: null },
];
const fixture: Fixture = { id: domainId<'Fixture'>('fixture-id'), sportId: FOOTBALL.id, competitionId: competition.id,
  seasonId: season.id, homeTeamId: teams[0].id, awayTeamId: teams[1].id, kickoff: new Date('2026-09-07T22:30:00-03:00'),
  status: FixtureStatus.SCHEDULED, homeScore: null, awayScore: null, createdAt: now, updatedAt: now, providerUpdatedAt: now };
const target: FootballCompetitionTarget = { key: 'br-serie-a', slug: competition.slug, canonicalName: 'Brasileirão Série A',
  displayNames: { br: 'Brasileirão Série A', mx: 'Brasileirão Serie A' }, type: CompetitionType.DOMESTIC_LEAGUE,
  region: 'SOUTH_AMERICA', group: 'BRAZIL', countryCode: 'BR', countryNames: ['Brazil'], lookupNames: ['Brasileiro Serie A'],
  enabled: true, priority: { br: 1, mx: 10 }, geoRelevance: ['BR', 'MX'], seasonStrategy: 'STANDARD', teamType: TeamType.CLUB };

class FakeProvider implements FootballIngestionProvider {
  requests = 0;
  throwOnDiscover = false;
  fixtures: Fixture[] = [fixture];
  scoreIds: string[] = [];
  seasonRows: Season[] = [season];
  async discoverCompetitions() { this.requests++; if (this.throwOnDiscover) throw new Error('secret-token-value');
    return { sport: FOOTBALL, countries: [PRODUCT_COUNTRIES.BR], competitions: [{ targetKey: target.key, competition }] }; }
  async getCompetitionCatalog() { throw new Error('unused'); }
  async getTeamCatalog() { this.requests++; return { countries: [PRODUCT_COUNTRIES.BR], teams }; }
  getRequestCount() { return this.requests; }
  async getCompetitions() { return [competition]; }
  async getSeasons() { this.requests++; return this.seasonRows; }
  async getTeams() { return teams; }
  async getFixtures(query: FixtureQuery) { void query; this.requests++; return this.fixtures; }
  async getFixture() { return fixture; }
  async getScores(ids: readonly string[]) { this.scoreIds = [...ids]; this.requests++; return [{ ...fixture, status: FixtureStatus.FINISHED, homeScore: 2, awayScore: 1 }]; }
  async getEvents() { return []; } async getStandings() { return []; } async getLineups() { return []; }
  async getStatistics() { return []; } async getHeadToHead() { return []; }
}

describe('M2 football ingestion', () => {
  it('upserts competitions and seasons idempotently', async () => {
    const provider = new FakeProvider(); const store = new InMemoryFootballIngestionStore();
    const service = new FootballIngestionService(provider, store, [target], () => now);
    expect((await service.syncCompetitions()).inserted).toBe(3);
    expect((await service.syncCompetitions()).updated).toBe(3);
    expect((await service.syncSeasons()).inserted).toBe(1);
    expect((await service.syncSeasons()).updated).toBe(1);
    expect(store.competitions).toHaveLength(1);
    expect(store.seasons).toHaveLength(1);
  });

  it('keeps one provider-current season for standard competitions', async () => {
    const provider = new FakeProvider(); const store = new InMemoryFootballIngestionStore();
    provider.seasonRows = [season, { ...season, id: domainId<'Season'>('older-current-season'), name: '2025',
      startsAt: new Date('2025-01-01T00:00:00Z'), endsAt: new Date('2025-12-31T23:59:59Z') }];
    const service = new FootballIngestionService(provider, store, [target], () => now);
    await service.syncCompetitions();
    expect((await service.syncSeasons()).inserted).toBe(1);
    expect(store.seasons).toHaveLength(1);
    expect(store.seasons.get(season.id)?.name).toBe('2026');
  });

  it('persists team memberships, prevents duplicate fixtures, and preserves UTC identity', async () => {
    const provider = new FakeProvider(); const store = new InMemoryFootballIngestionStore();
    const service = new FootballIngestionService(provider, store, [target], () => now);
    await service.syncCompetitions(); await service.syncSeasons(); await service.syncTeams();
    expect(store.teamSeasons).toContain(`${teams[0].id}:${season.id}`);
    expect((await service.syncFixtures()).inserted).toBe(1);
    expect((await service.syncFixtures()).updated).toBe(1);
    expect(store.fixtures).toHaveLength(1);
    expect(store.fixtures.get(fixture.id)?.kickoff.toISOString()).toBe('2026-09-08T01:30:00.000Z');
  });

  it('limits resumable stages to explicitly selected competition targets', async () => {
    const provider = new FakeProvider(); const store = new InMemoryFootballIngestionStore();
    const otherTarget = { ...target, key: 'other-target', slug: 'other-league', canonicalName: 'Other League' };
    const otherCompetition = { ...competition, id: domainId<'Competition'>('other-competition'), slug: otherTarget.slug };
    const otherSeason = { ...season, id: domainId<'Season'>('other-season'), competitionId: otherCompetition.id, targetKey: otherTarget.slug };
    await store.upsertCompetitions([
      { targetKey: target.key, competition, target },
      { targetKey: otherTarget.key, competition: otherCompetition, target: otherTarget },
    ]);
    await store.upsertSeasons([{ ...season, targetKey: target.slug }, otherSeason]);
    const service = new FootballIngestionService(provider, store, [target], () => now);
    await service.syncTeams();
    expect(provider.requests).toBe(1);
    expect(store.teamSeasons.has(`${teams[0].id}:${season.id}`)).toBe(true);
    expect(store.teamSeasons.has(`${teams[0].id}:${otherSeason.id}`)).toBe(false);
  });

  it('updates the same fixture with its finished score', async () => {
    const provider = new FakeProvider(); const store = new InMemoryFootballIngestionStore();
    const invalidator = new RecordingCacheInvalidator();
    const service = new FootballIngestionService(provider, store, [target], () => now, invalidator);
    await service.syncCompetitions(); await service.syncSeasons(); await service.syncTeams(); await service.syncFixtures();
    expect((await service.syncFixtureScores()).updated).toBe(1);
    expect(store.fixtures.get(fixture.id)).toMatchObject({ status: FixtureStatus.FINISHED, homeScore: 2, awayScore: 1 });
    expect(provider.scoreIds).toEqual([fixture.id]);
    expect(invalidator.tags).toContain(`livasports:v1:fixture:${fixture.id}`);
    expect(invalidator.tags).toContain('livasports:v1:fixtures:live:br');
  });

  it('handles empty provider fixture responses without deleting history', async () => {
    const provider = new FakeProvider(); const store = new InMemoryFootballIngestionStore();
    const service = new FootballIngestionService(provider, store, [target], () => now);
    await service.syncCompetitions(); await service.syncSeasons(); await service.syncTeams(); await service.syncFixtures();
    provider.fixtures = [];
    expect(await service.syncFixtures()).toMatchObject({ inserted: 0, updated: 0 });
    expect(store.fixtures).toHaveLength(1);
  });

  it('stores only a safe health error for unexpected provider failures', async () => {
    const provider = new FakeProvider(); provider.throwOnDiscover = true;
    const store = new InMemoryFootballIngestionStore();
    await expect(new FootballIngestionService(provider, store, [target], () => now).syncCompetitions()).rejects.toThrow();
    const run = [...store.runs.values()][0];
    expect(run.status).toBe('FAILED');
    expect(run.errorMessage).not.toContain('secret-token-value');
  });

  it('binds provider references to stable LivaSports IDs', async () => {
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    await mappings.bind(ProviderCode.SPORTMONKS, ProviderEntityType.COUNTRY, '5', PRODUCT_COUNTRIES.BR.id);
    await expect(mappings.lookupProviderId(ProviderCode.SPORTMONKS, ProviderEntityType.COUNTRY, PRODUCT_COUNTRIES.BR.id)).resolves.toBe('5');
  });

  it('reads pages from the DB repository boundary and filters live status', async () => {
    let competitionReads = 0; let fixtureReads = 0;
    const repository = {
      listCompetitions: async () => { competitionReads++; return [
        { competitionName: competition.name, competitionSlug: competition.slug, competitionGroup: 'BRAZIL', competitionPriority: 1 },
        { competitionName: 'Paulista A1', competitionSlug: 'paulista-a1', competitionGroup: 'BRAZIL', competitionPriority: 2 },
      ]; },
      listFixtures: async () => { fixtureReads++; return [{ fixture: { ...fixture, status: FixtureStatus.LIVE }, competitionName: competition.name,
        competitionSlug: competition.slug, competitionGroup: 'BRAZIL', competitionPriority: 1, homeTeamName: 'Home', awayTeamName: 'Away' }]; },
    };
    const data = await new DatabaseM2ReadService(repository, () => now).load('br', 'live');
    expect(competitionReads).toBe(1);
    expect(fixtureReads).toBe(1);
    expect(data.sections).toHaveLength(2);
    expect(data.sections[0].fixtures[0].status).toBe(FixtureStatus.LIVE);
    expect(data.sections[1]).toMatchObject({ competition: 'Paulista A1', fixtures: [] });
    expect(data.paidOddsRequests).toBe(0);
  });
});
