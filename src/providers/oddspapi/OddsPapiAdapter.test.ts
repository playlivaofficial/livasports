import { describe, expect, it } from 'vitest';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { OddsPapiAdapter } from './OddsPapiAdapter';
import type { OddsPapiGateway } from './types';

describe('OddsPapi provider boundary', () => {
  it('calls the gateway once per bookmaker and never combines bookmaker slugs', async () => {
    const calls: Array<{ tournamentIds: readonly string[]; bookmaker: string }> = [];
    const gateway: OddsPapiGateway = {
      bookmakers: async () => [],
      markets: async () => [],
      oddsByTournaments: async (tournamentIds, bookmaker) => { calls.push({ tournamentIds, bookmaker }); return []; },
      requestCount: () => calls.length,
    };
    const fixtureId = domainId<'Fixture'>('internal-fixture');
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    await mappings.getOrCreate(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, 'odds-fixture', () => fixtureId,
      { tournamentId: 325 });

    const result = await new OddsPapiAdapter(gateway, mappings).getPregameOdds({
      fixtureIds: [fixtureId], bookmakerSlugs: ['betano.bet.br', 'betsson'],
    });

    expect(calls).toEqual([
      { tournamentIds: ['325'], bookmaker: 'betano.bet.br' },
      { tournamentIds: ['325'], bookmaker: 'betsson' },
    ]);
    expect(result.providerRequests).toBe(2);
  });
});
