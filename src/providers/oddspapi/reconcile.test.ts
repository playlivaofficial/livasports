import { describe, expect, it } from 'vitest';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId } from '@/domain/ids';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { reconcileOddsPapiFixtures } from './reconcile';

const candidate = { fixtureId: domainId<'Fixture'>('canonical-fixture'), countryCode: 'BR', competitionName: 'Serie A',
  homeTeamName: 'Flamengo', awayTeamName: 'Mirassol', kickoff: new Date('2026-09-08T22:30:00Z') };
const raw = { fixtureId: 'oddspapi-99', tournamentId: 325, statusId: 0, participant1Name: 'Flamengo RJ', participant2Name: 'Mirassol SP', startTime: '2026-09-08T22:30:00Z' };

describe('conservative cross-provider fixture reconciliation', () => {
  it('joins only with tournament, ordered teams, and kickoff safeguards', async () => {
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    await expect(reconcileOddsPapiFixtures([candidate], [raw], mappings)).resolves.toMatchObject({ matched: 1, missing: [], ambiguous: [] });
    await expect(mappings.lookup(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, 'oddspapi-99')).resolves.toMatchObject({ livasportsEntityId: 'canonical-fixture' });
  });

  it('rejects ambiguous candidates and wrong competition matches', async () => {
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const duplicate = { ...candidate, fixtureId: domainId<'Fixture'>('another-canonical') };
    const result = await reconcileOddsPapiFixtures([candidate, duplicate], [raw], mappings);
    expect(result.ambiguous).toEqual(['oddspapi-99']);
    expect(await mappings.lookup(ProviderCode.ODDSPAPI, ProviderEntityType.FIXTURE, 'oddspapi-99')).toBeNull();
    const wrong = await reconcileOddsPapiFixtures([{ ...candidate, competitionName: 'Copa do Brasil' }], [raw], mappings);
    expect(wrong.missing).toEqual(['oddspapi-99']);
  });
});
