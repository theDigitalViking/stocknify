-- RLS policies for schema v4 tables and fields.
-- Run after the Prisma migration via: pnpm --filter api db:migrate:manual

-- incidents: tenants can only read their own user-visible incidents
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_select ON incidents
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    AND is_user_visible = true
  );

CREATE POLICY incident_update ON incidents
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    AND is_user_visible = true
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- No INSERT policy for tenants — incidents are created by the system only.
-- No DELETE policy for tenants — incidents are never deleted by tenants.
