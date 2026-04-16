-- Ensure attribute values cannot reference definitions from another tenant.
-- Enforced via a CHECK constraint using a subquery.
ALTER TABLE integration_attribute_values
  ADD CONSTRAINT check_definition_tenant
  CHECK (
    tenant_id = (
      SELECT tenant_id FROM integration_attribute_definitions WHERE id = definition_id
    )
  );
