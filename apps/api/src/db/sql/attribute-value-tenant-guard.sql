-- Atomic replacement of cross-tenant guard.
-- Wrapped in a transaction so the table is never left without a guard.
BEGIN;

-- Remove old CHECK constraint (round 1 artifact)
ALTER TABLE integration_attribute_values
  DROP CONSTRAINT IF EXISTS check_definition_tenant;

-- Remove old FK (round 2 artifact, was CASCADE)
ALTER TABLE integration_attribute_values
  DROP CONSTRAINT IF EXISTS fk_attribute_value_tenant_definition;

-- Add composite FK with RESTRICT (prevents accidental bulk delete)
ALTER TABLE integration_attribute_values
  ADD CONSTRAINT fk_attribute_value_tenant_definition
  FOREIGN KEY (tenant_id, definition_id)
  REFERENCES integration_attribute_definitions (tenant_id, id)
  ON DELETE RESTRICT;

COMMIT;
