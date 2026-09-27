BEGIN;

-- Historical production activation, already recorded in schema_migrations.
-- Private partner destinations and campaign identifiers were removed from source.
-- On a new database, keep affiliate CTAs gated until an operator-approved campaign is
-- provisioned through the server-only affiliate configuration workflow. Never seed
-- a real partner account or a synthetic tracking destination from a schema migration.
-- Existing production campaign rows are deliberately untouched.

COMMIT;
