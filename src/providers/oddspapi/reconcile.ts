import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import type { ProviderMappingService } from '@/domain/provider-mapping';
import type { OddsFixtureMatchCandidate } from '@/providers/contracts/OddsProvider';
import type { OddsPapiFixtureOdds } from './types';
import { normalizedProviderName, resolveOddsPapiTournamentId } from './tournament-map';

export interface ReconciliationResult { matched: number; missing: string[]; ambiguous: string[]; }

function teamKey(value: string): string {
  const tokens = normalizedProviderName(value).split(' ').filter(Boolean);
  while (tokens.length > 1 && /^(fc|cf|sc|ac|rj|sp|mg)$/.test(tokens.at(-1) ?? '')) tokens.pop();
  return tokens.join(' ');
}

export async function reconcileOddsPapiFixtures(
  canonical: readonly OddsFixtureMatchCandidate[], providerFixtures: readonly OddsPapiFixtureOdds[], mappings: ProviderMappingService,
  kickoffToleranceMs = 15 * 60 * 1000,
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = { matched: 0, missing: [], ambiguous: [] };
  for (const raw of providerFixtures) {
    const rawKickoff = raw.startTime ? new Date(raw.startTime) : null;
    if (!rawKickoff || Number.isNaN(rawKickoff.getTime()) || !raw.participant1Name || !raw.participant2Name) {
      result.missing.push(raw.fixtureId); continue;
    }
    const candidates = canonical.filter(fixture => {
      const expectedTournament = resolveOddsPapiTournamentId(fixture.countryCode, fixture.competitionName);
      return expectedTournament === String(raw.tournamentId)
        && teamKey(fixture.homeTeamName) === teamKey(raw.participant1Name ?? '')
        && teamKey(fixture.awayTeamName) === teamKey(raw.participant2Name ?? '')
        && Math.abs(fixture.kickoff.getTime() - rawKickoff.getTime()) <= kickoffToleranceMs;
    });
    if (candidates.length !== 1) {
      (candidates.length > 1 ? result.ambiguous : result.missing).push(raw.fixtureId); continue;
    }
    await mappings.getOrCreate(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, raw.fixtureId, () => candidates[0].fixtureId, {
      tournamentId: String(raw.tournamentId), matchedBy: 'competition+home+away+kickoff',
    });
    result.matched++;
  }
  return result;
}
