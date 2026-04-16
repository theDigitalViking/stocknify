-- Enforce cross-tenant guard via composite FK instead of CHECK subquery.
-- CHECK subqueries are not re-evaluated when the referenced row changes.
-- A composite FK is enforced by Postgres on every write to both tables.

-- Drop the old CHECK constraint if it exists
ALTER TABLE integration_attribute_values
  DROP CONSTRAINT IF EXISTS check_definition_tenant;

-- Add composite FK referencing the unique(tenant_id, id) on definitions
ALTER TABLE integration_attribute_values
  ADD CONSTRAINT fk_attribute_value_tenant_definition
  FOREIGN KEY (tenant_id, definition_id)
  REFERENCES integration_attribute_definitions (tenant_id, id)
  ON DELETE CASCADE;
