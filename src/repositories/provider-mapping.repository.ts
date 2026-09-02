import type { ProviderEntityMapping, ProviderEntityMappingRepository } from '@/domain/provider-mapping';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';

const providerKey = (provider: ProviderCode, type: ProviderEntityType, id: string) => `${provider}:${type}:${id}`;

export class InMemoryProviderEntityMappingRepository implements ProviderEntityMappingRepository {
  private readonly byProvider = new Map<string, ProviderEntityMapping>();
  private readonly byInternal = new Map<string, ProviderEntityMapping>();

  async findByProviderReference(provider: ProviderCode, entityType: ProviderEntityType, providerEntityId: string): Promise<ProviderEntityMapping | null> {
    return this.byProvider.get(providerKey(provider, entityType, providerEntityId)) ?? null;
  }

  async findByLivaSportsId(provider: ProviderCode, entityType: ProviderEntityType, livasportsEntityId: string): Promise<ProviderEntityMapping | null> {
    return this.byInternal.get(providerKey(provider, entityType, livasportsEntityId)) ?? null;
  }

  async save(mapping: ProviderEntityMapping): Promise<void> {
    const externalKey = providerKey(mapping.provider, mapping.entityType, mapping.providerEntityId);
    const internalKey = providerKey(mapping.provider, mapping.entityType, mapping.livasportsEntityId);
    const externalConflict = this.byProvider.get(externalKey);
    if (externalConflict && externalConflict.livasportsEntityId !== mapping.livasportsEntityId) {
      throw new Error('Provider entity is already mapped to a different LivaSports entity');
    }
    const internalConflict = this.byInternal.get(internalKey);
    if (internalConflict && internalConflict.providerEntityId !== mapping.providerEntityId) {
      throw new Error('LivaSports entity is already mapped to a different provider entity');
    }
    this.byProvider.set(externalKey, mapping);
    this.byInternal.set(internalKey, mapping);
  }
}
