import { newDomainId, type DomainId } from './ids';
import { ProviderCode, ProviderEntityType } from './enums';

export interface ProviderEntityMapping {
  id: DomainId<'ProviderEntityMapping'>;
  provider: ProviderCode;
  entityType: ProviderEntityType;
  providerEntityId: string;
  livasportsEntityId: string;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderEntityMappingRepository {
  findByProviderReference(provider: ProviderCode, entityType: ProviderEntityType, providerEntityId: string): Promise<ProviderEntityMapping | null>;
  findByLivaSportsId(provider: ProviderCode, entityType: ProviderEntityType, livasportsEntityId: string): Promise<ProviderEntityMapping | null>;
  save(mapping: ProviderEntityMapping): Promise<void>;
}

export class ProviderMappingService {
  constructor(private readonly repository: ProviderEntityMappingRepository) {}

  lookup(provider: ProviderCode, entityType: ProviderEntityType, providerEntityId: string): Promise<ProviderEntityMapping | null> {
    return this.repository.findByProviderReference(provider, entityType, providerEntityId);
  }

  lookupProviderId(provider: ProviderCode, entityType: ProviderEntityType, livasportsEntityId: string): Promise<string | null> {
    return this.repository.findByLivaSportsId(provider, entityType, livasportsEntityId)
      .then(mapping => mapping?.providerEntityId ?? null);
  }

  lookupByLivaSportsId(provider: ProviderCode, entityType: ProviderEntityType, livasportsEntityId: string): Promise<ProviderEntityMapping | null> {
    return this.repository.findByLivaSportsId(provider, entityType, livasportsEntityId);
  }

  async getOrCreate(
    provider: ProviderCode, entityType: ProviderEntityType, providerEntityId: string,
    createLivaSportsEntityId: () => string, metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<ProviderEntityMapping> {
    const existing = await this.lookup(provider, entityType, providerEntityId);
    if (existing) return existing;
    const now = new Date();
    const mapping: ProviderEntityMapping = {
      id: newDomainId<'ProviderEntityMapping'>(), provider, entityType, providerEntityId,
      livasportsEntityId: createLivaSportsEntityId(), metadata, createdAt: now, updatedAt: now,
    };
    await this.repository.save(mapping);
    return mapping;
  }
}
