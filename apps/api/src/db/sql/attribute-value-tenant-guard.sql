-- Enforce cross-tenant guard via composite FK instead of CHECK subquery.
-- CHECK subqueries are not re-evaluated when the referenced row changes.
-- A composite FK is enforced by Postgres on every write to both tables.
--
-- ON DELETE RESTRICT: deleting an integration_attribute_definition is blocked
-- if any values still reference it. The application must explicitly delete
-- values before deleting the definition. This prevents accidental bulk data
-- loss from a single definition delete.

-- Drop the old CHECK constraint if it exists (from round 1)
ALTER TABLE integration_attribute_values
  DROP CONSTRAINT IF EXISTS check_definition_tenant;

-- Drop any prior version of this FK so we can re-add with RESTRICT
ALTER TABLE integration_attribute_values
  DROP CONSTRAINT IF EXISTS fk_attribute_value_tenant_definition;

-- Add composite FK referencing the unique(tenant_id, id) on definitions
ALTER TABLE integration_attribute_values
  ADD CONSTRAINT fk_attribute_value_tenant_definition
  FOREIGN KEY (tenant_id, definition_id)
  REFERENCES integration_attribute_definitions (tenant_id, id)
  ON DELETE RESTRICT;
