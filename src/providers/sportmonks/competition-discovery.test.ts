import { describe, expect, it, vi } from 'vitest';
import { NEW_GEO_COMPETITION_TARGETS, targetBySlug } from '@/config/footballCompetitions';
import { CompetitionCoverageStatus, ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { classifyAccessibleCoverage, classifyMissingAccess } from '@/competition/coverage';
import { SportmonksAdapter } from './SportmonksAdapter';
import type { SportmonksGateway, SportmonksLeaguePayload } from './types';

const league = (id: number, name: string, code: string): SportmonksLeaguePayload => ({
  id, sport_id: 1, country_id: code === 'CO' ? 101 : code === 'PE' ? 102 : 103,
  name, country: { iso2: code, name: code === 'CO' ? 'Colombia' : code === 'PE' ? 'Peru' : 'Mexico' },
});

describe('verified competition discovery', () => {
  it('accepts a renamed exact ID but rejects homonyms, missing IDs and conflicting countries', () => {
    const target = targetBySlug('colombia-primera-a')!;
    const [renamed] = classifyAccessibleCoverage([target], [league(672, 'New sponsor label', 'CO'), league(999, 'Primera A', 'CO')]);
    expect(renamed.providerCompetition?.id).toBe(672);
    for (const candidates of [[league(999, 'Primera A', 'CO')], [league(672, 'Primera A', 'PE')]]) {
      const [result] = classifyAccessibleCoverage([target], candidates);
      expect(result.classification).toBe(CompetitionCoverageStatus.NOT_FOUND);
      expect(result.providerCompetition).toBeNull();
      expect(result.notes.join(' ')).toContain('Verified Sportmonks ID 672');
      expect(classifyMissingAccess(result, [league(999, 'Primera A', 'CO')]).classification).toBe(CompetitionCoverageStatus.NOT_FOUND);
    }
  });

  it('uses existing canonical CO/PE countries and stable provider mappings on repeated discovery', async () => {
    const selected = NEW_GEO_COMPETITION_TARGETS.filter(row => ['colombia-primera-a', 'peru-liga-1'].includes(row.slug));
    const rows = [league(672, 'Primera A', 'CO'), league(764, 'Primera Division', 'PE'), league(99, 'Primera A', 'CO')];
    const gateway = { competitions: vi.fn(async () => rows) } as unknown as SportmonksGateway;
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const existingCompetitionId = domainId<'Competition'>('existing-canonical-competition');
    await mappings.bind(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, '672', existingCompetitionId);
    const resolveCountry = vi.fn(async (code: string) => ({ id: domainId<'Country'>(`existing-${code}`), code, name: code === 'CO' ? 'Colombia' : 'Peru' }));
    const adapter = new SportmonksAdapter(gateway, mappings, resolveCountry);
    const first = await adapter.discoverCompetitions(selected);
    const repeated = await adapter.discoverCompetitions(selected);
    expect(first.competitions).toEqual(repeated.competitions);
    expect(first.competitions).toHaveLength(2);
    expect(first.competitions.find(row => row.targetKey === 'co-primera-a')?.competition)
      .toMatchObject({ id: existingCompetitionId, countryId: 'existing-CO', slug: 'colombia-primera-a' });
    expect(first.competitions.find(row => row.targetKey === 'pe-liga-1')?.competition.countryId).toBe('existing-PE');
    expect(resolveCountry).toHaveBeenCalledTimes(2);
    expect(gateway.competitions).toHaveBeenCalledTimes(2);
    expect((await mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, '672'))?.metadata)
      .toMatchObject({ verifiedSportmonksId: 672, acquisitionEligible: true, parentSlug: null });
    await expect(mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, '99')).resolves.toBeNull();
  });

  it('records child metadata without creating a standalone acquisition identity', async () => {
    const target = targetBySlug('saudi-pro-league-playoffs')!;
    const raw = { ...league(1678, 'Pro League Play-offs', 'SA'), country: { iso2: 'SA', name: 'Saudi Arabia' } };
    const gateway = { competitions: vi.fn(async () => [raw]) } as unknown as SportmonksGateway;
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const catalog = await new SportmonksAdapter(gateway, mappings).discoverCompetitions([target]);
    expect(catalog.competitions).toHaveLength(1);
    expect((await mappings.lookup(ProviderCode.SPORTMONKS, ProviderEntityType.COMPETITION, '1678'))?.metadata)
      .toMatchObject({ verifiedSportmonksId: 1678, acquisitionEligible: false, parentSlug: 'saudi-pro-league' });
  });
});
