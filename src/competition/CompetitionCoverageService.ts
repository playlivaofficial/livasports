import type { FootballCompetitionTarget } from '@/config/footballCompetitions';
import { DEFAULT_INGESTION_WINDOW } from '@/config/footballCompetitions';
import { CompetitionCoverageStatus } from '@/domain/enums';
import { SafeProviderError } from '@/providers/safe-error';
import type { SportmonksFixturePayload, SportmonksGateway, SportmonksLeaguePayload } from '@/providers/sportmonks/types';
import { applyFixtureAvailability, classifyAccessibleCoverage, classifyMissingAccess, type CompetitionCoverageResult } from './coverage';

export interface CoverageValidation {
  generatedAt: string;
  window: { from: string; to: string };
  accessibleCatalog: SportmonksLeaguePayload[];
  results: CompetitionCoverageResult[];
  fixtures: SportmonksFixturePayload[];
  requestsConsumed: number;
}

function day(date: Date): string { return date.toISOString().slice(0, 10); }

export class CompetitionCoverageService {
  constructor(private readonly gateway: SportmonksGateway, private readonly now: () => Date = () => new Date()) {}

  async validate(targets: readonly FootballCompetitionTarget[]): Promise<CoverageValidation> {
    const before = this.gateway.requestCount();
    const now = this.now();
    const from = new Date(now.getTime() - DEFAULT_INGESTION_WINDOW.daysPast * 86_400_000);
    const to = new Date(now.getTime() + DEFAULT_INGESTION_WINDOW.daysFuture * 86_400_000);
    const accessibleCatalog = await this.gateway.competitions();
    const preliminary = classifyAccessibleCoverage(targets, accessibleCatalog);
    const resolved: CompetitionCoverageResult[] = [];

    for (const result of preliminary) {
      if (result.classification !== CompetitionCoverageStatus.NOT_FOUND) {
        resolved.push(result);
        continue;
      }
      let candidates: SportmonksLeaguePayload[] = [];
      let diagnostic: string | null = null;
      for (const alias of result.target.lookupNames.slice(0, 1)) {
        try {
          candidates = await this.gateway.searchCompetitions(alias);
          if (candidates.length) break;
        } catch (error) {
          if (error instanceof SafeProviderError) diagnostic = `${error.context.status} ${error.context.code ?? 'NO_CODE'}`;
          else diagnostic = 'sanitized search failure';
          break;
        }
      }
      const classified = classifyMissingAccess(result, candidates);
      if (diagnostic) classified.notes.push(`Provider search diagnostic: ${diagnostic}.`);
      resolved.push(classified);
    }

    const fixtureBatches = new Map<string, string[]>();
    for (const result of resolved) {
      if (result.classification !== CompetitionCoverageStatus.SUPPORTED || !result.providerCompetition) continue;
      const ids = fixtureBatches.get(result.target.group) ?? [];
      ids.push(String(result.providerCompetition.id));
      fixtureBatches.set(result.target.group, ids);
    }
    const fixtures: SportmonksFixturePayload[] = [];
    const checkedLeagueIds = new Set<number>();
    const fixtureErrors = new Map<string, string>();
    for (const [batch, ids] of fixtureBatches) {
      try {
        fixtures.push(...await this.gateway.fixtures(from, to, ids));
        ids.forEach(id => checkedLeagueIds.add(Number(id)));
      } catch (error) {
        fixtureErrors.set(batch, error instanceof SafeProviderError
          ? `${error.context.status} ${error.context.code ?? 'NO_CODE'}` : 'sanitized fixture discovery failure');
      }
    }
    const fixtureCounts = new Map<number, number>();
    for (const fixture of fixtures) fixtureCounts.set(fixture.league_id, (fixtureCounts.get(fixture.league_id) ?? 0) + 1);
    const results = resolved.map(result => {
      if (!result.providerCompetition || !checkedLeagueIds.has(result.providerCompetition.id)) {
        const diagnostic = fixtureErrors.get(result.target.group);
        return diagnostic ? { ...result, notes: [...result.notes, `Fixture batch diagnostic: ${diagnostic}.`] } : result;
      }
      return applyFixtureAvailability(result, fixtureCounts);
    });

    return { generatedAt: now.toISOString(), window: { from: day(from), to: day(to) }, accessibleCatalog,
      results, fixtures, requestsConsumed: this.gateway.requestCount() - before };
  }
}
