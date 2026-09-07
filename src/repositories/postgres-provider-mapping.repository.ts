import type { QueryExecutor } from '@/database/client';
import type { ProviderEntityMapping, ProviderEntityMappingRepository } from '@/domain/provider-mapping';
import { ProviderCode, ProviderEntityType } from '@/domain/enums';
import { domainId } from '@/domain/ids';

interface MappingRow {
  id: string; provider: ProviderCode; entity_type: ProviderEntityType; provider_entity_id: string;
  livasports_entity_id: string; metadata: Record<string, unknown>; created_at: Date; updated_at: Date;
}

function mapRow(row: MappingRow): ProviderEntityMapping {
  return { id: domainId<'ProviderEntityMapping'>(row.id), provider: row.provider, entityType: row.entity_type,
    providerEntityId: row.provider_entity_id, livasportsEntityId: row.livasports_entity_id,
    metadata: row.metadata, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}

export class PostgresProviderEntityMappingRepository implements ProviderEntityMappingRepository {
  constructor(private readonly database: QueryExecutor) {}

  async findByProviderReference(provider: ProviderCode, entityType: ProviderEntityType, providerEntityId: string) {
    const result = await this.database.query<MappingRow>(
      'SELECT * FROM provider_entity_mappings WHERE provider = $1 AND entity_type = $2 AND provider_entity_id = $3',
      [provider, entityType, providerEntityId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByLivaSportsId(provider: ProviderCode, entityType: ProviderEntityType, livasportsEntityId: string) {
    const result = await this.database.query<MappingRow>(
      'SELECT * FROM provider_entity_mappings WHERE provider = $1 AND entity_type = $2 AND livasports_entity_id = $3',
      [provider, entityType, livasportsEntityId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async save(mapping: ProviderEntityMapping): Promise<void> {
    await this.database.query(`INSERT INTO provider_entity_mappings
      (id, provider, entity_type, provider_entity_id, livasports_entity_id, metadata, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
      ON CONFLICT (provider, entity_type, provider_entity_id) DO UPDATE SET
        metadata = EXCLUDED.metadata, updated_at = now()
      WHERE provider_entity_mappings.livasports_entity_id = EXCLUDED.livasports_entity_id`,
    [mapping.id, mapping.provider, mapping.entityType, mapping.providerEntityId, mapping.livasportsEntityId,
      JSON.stringify(mapping.metadata), mapping.createdAt, mapping.updatedAt]);
  }
}
