-- RLS policies for schema v4 (incidents table).
-- Idempotent: drops existing policies before recreating.
-- Run after the Prisma migration via: pnpm --filter api db:migrate:manual

BEGIN;

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS incident_select ON incidents;
DROP POLICY IF EXISTS incident_update ON incidents;
DROP POLICY IF EXISTS incident_insert ON incidents;
DROP POLICY IF EXISTS incident_delete ON incidents;

-- SELECT: tenants can only read their own user-visible incidents.
CREATE POLICY incident_select ON incidents
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    AND is_user_visible = true
  );

-- UPDATE: tenants can acknowledge/resolve their own user-visible incidents.
CREATE POLICY incident_update ON incidents
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    AND is_user_visible = true
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- No INSERT policy: incidents are created by the system only via service_role (BYPASSRLS).
-- No DELETE policy: incidents are never deleted by tenants.

COMMIT;
