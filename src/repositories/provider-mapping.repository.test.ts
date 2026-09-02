import { describe, expect, it } from 'vitest';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from './provider-mapping.repository';

describe('provider mapping', () => {
  it('creates a stable lookup without using provider IDs as domain IDs', async () => {
    const service = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const first = await service.getOrCreate(ProviderCode.SPORTMONKS, ProviderEntityType.FIXTURE, 'provider-42', () => 'internal-uuid');
    const second = await service.getOrCreate(ProviderCode.SPORTMONKS, ProviderEntityType.FIXTURE, 'provider-42', () => 'different');
    expect(first.livasportsEntityId).toBe('internal-uuid');
    expect(second.livasportsEntityId).toBe('internal-uuid');
    expect(first.livasportsEntityId).not.toBe(first.providerEntityId);
  });
});
