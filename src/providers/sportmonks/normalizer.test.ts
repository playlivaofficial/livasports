import { describe, expect, it } from 'vitest';
import { FixtureStatus, ProviderCode, ProviderEntityType } from '@/domain/enums';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { SportmonksNormalizer } from './normalizer';

describe('Sportmonks canonical normalization', () => {
  it('maps provider fixture fields, status, teams, and current scores to internal entities', async () => {
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const normalizer = new SportmonksNormalizer(mappings);

    const fixture = await normalizer.fixture({
      id: 9981,
      sport_id: 1,
      league_id: 325,
      season_id: 2026,
      state_id: 5,
      starting_at: '2026-09-03T22:00:00Z',
      state: { developer_name: 'FINISHED' },
      participants: [
        { id: 10, name: 'Time da Casa', meta: { location: 'home' } },
        { id: 20, name: 'Time Visitante', meta: { location: 'away' } },
      ],
      scores: [
        { participant_id: 10, description: 'CURRENT', score: { goals: 2 } },
        { participant_id: 20, description: 'CURRENT', score: { goals: 1 } },
      ],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-09-03T23:58:00Z',
    });

    expect(fixture.id).not.toBe('9981');
    expect(fixture.homeTeamId).not.toBe('10');
    expect(fixture.awayTeamId).not.toBe('20');
    expect(fixture.status).toBe(FixtureStatus.FINISHED);
    expect([fixture.homeScore, fixture.awayScore]).toEqual([2, 1]);
    await expect(mappings.lookupProviderId(ProviderCode.SPORTMONKS, ProviderEntityType.FIXTURE, fixture.id))
      .resolves.toBe('9981');
  });
});
