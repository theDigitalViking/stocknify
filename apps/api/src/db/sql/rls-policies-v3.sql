-- RLS policies for all new tenant-scoped tables added in schema v3.
-- Run this after the v3 Prisma migration using the Supabase SQL editor
-- (direct connection, not pooler — Supabase service role or postgres role).
--
-- This script is idempotent: DROP POLICY IF EXISTS + CREATE inside a single
-- transaction ensures no window with zero policies, and re-runs are safe.
--
-- Tables added in v3:
--   Tenant-scoped: external_references, integration_credentials,
--                  integration_attribute_definitions, integration_attribute_values,
--                  csv_mapping_templates, integration_schedules, notification_templates
--   Non-tenant:    partners (admin context only), partner_users (partner context only)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Standard tenant-scoped tables
--    Policy: read and write restricted to the current tenant.
--    Idempotent: DROP IF EXISTS before CREATE inside a transaction.
-- ---------------------------------------------------------------------------

DO $$ DECLARE
  tables TEXT[] := ARRAY[
    'external_references',
    'integration_credentials',
    'integration_attribute_definitions',
    'integration_attribute_values',
    'csv_mapping_templates',
    'integration_schedules'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_isolation ON %I
          USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
          WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid)
      $policy$,
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. notification_templates — special case: nullable tenant_id
--    System defaults have tenant_id = NULL and must be readable by all tenants
--    but writable by nobody (only the system/migrations can insert/update them).
--    Tenant-custom templates are scoped normally.
-- ---------------------------------------------------------------------------

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: tenants can read system defaults (tenant_id IS NULL) and their own templates
DROP POLICY IF EXISTS notification_templates_select ON notification_templates;
CREATE POLICY notification_templates_select ON notification_templates
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- INSERT: tenants can only insert their own custom templates (never system defaults)
DROP POLICY IF EXISTS notification_templates_insert ON notification_templates;
CREATE POLICY notification_templates_insert ON notification_templates
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  );

-- UPDATE: tenants can only update their own non-system templates
DROP POLICY IF EXISTS notification_templates_update ON notification_templates;
CREATE POLICY notification_templates_update ON notification_templates
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  );

-- DELETE: tenants can only delete their own non-system templates
DROP POLICY IF EXISTS notification_templates_delete ON notification_templates;
CREATE POLICY notification_templates_delete ON notification_templates
  FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  );

-- ---------------------------------------------------------------------------
-- 3. partners — accessed via admin context only (no tenant_id column)
--    Only requests with app.admin_context = 'true' can read/write.
--    The Supabase service_role (BYPASSRLS) is used for internal admin APIs.
--    This policy is a safety net for direct DB access.
-- ---------------------------------------------------------------------------

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_admin_only ON partners;
CREATE POLICY partners_admin_only ON partners
  USING (current_setting('app.admin_context', true) = 'true');

-- ---------------------------------------------------------------------------
-- 4. partner_users — accessed via partner context or admin context.
--    partner_users has a tenant_id, so tenant isolation applies for application
--    queries. Partner dashboard access is handled at the application layer
--    (API verifies partner_user membership before setting tenant context).
-- ---------------------------------------------------------------------------

ALTER TABLE partner_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_users_tenant_isolation ON partner_users;
CREATE POLICY partner_users_tenant_isolation ON partner_users
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    OR current_setting('app.admin_context', true) = 'true'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );

COMMIT;
