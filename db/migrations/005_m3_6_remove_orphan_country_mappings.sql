BEGIN;

DELETE FROM provider_entity_mappings AS mapping
WHERE mapping.provider = 'SPORTMONKS'
  AND mapping.entity_type = 'COUNTRY'
  AND NOT EXISTS (
    SELECT 1 FROM countries AS country WHERE country.id = mapping.livasports_entity_id
  );

COMMIT;
