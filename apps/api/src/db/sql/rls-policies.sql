-- RLS policies for all tenant-scoped tables.
-- Run this after the initial Prisma migration using the Supabase SQL editor
-- (direct connection, not pooler — Supabase service role or postgres role).
--
-- This script is idempotent: DROP POLICY IF EXISTS + CREATE inside a single
-- transaction ensures no window with zero policies, and re-runs are safe.
--
-- SECURITY NOTES:
-- - current_setting('app.current_tenant_id') WITHOUT the missing_ok flag:
--   throws an error if the setting is not defined (fail-closed, safe).
-- - The Supabase service_role has BYPASSRLS — use it only for migrations
--   and admin tasks, never for application queries.
-- - Application queries must use the anon or authenticated role (set via
--   Supabase Auth), which do NOT have BYPASSRLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Standard tenant-scoped tables
--    Policy: read and write restricted to the current tenant.
--    Idempotent: DROP IF EXISTS before CREATE inside a transaction.
-- ---------------------------------------------------------------------------

DO $$ DECLARE
  tables TEXT[] := ARRAY[
    'users',
    'products',
    'product_variants',
    'product_bundles',
    'batches',
    'locations',
    'storage_locations',
    'stock_levels',
    'stock_movements',
    'integrations',
    'rules',
    'rule_actions',
    'notification_channels',
    'alerts',
    'variant_location_config',
    'notification_deliveries'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Enable RLS (idempotent — safe to run multiple times)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop existing policy if present, then recreate (idempotent)
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
-- 2. stock_type_definitions — special case: nullable tenant_id
--    System defaults have tenant_id = NULL and must be readable by all tenants
--    but writable by nobody (only the system/migrations can insert/update them).
--    Tenant-custom types are scoped normally.
-- ---------------------------------------------------------------------------

ALTER TABLE stock_type_definitions ENABLE ROW LEVEL SECURITY;

-- SELECT: tenants can read system defaults (tenant_id IS NULL) and their own custom types
DROP POLICY IF EXISTS stock_type_definitions_select ON stock_type_definitions;
CREATE POLICY stock_type_definitions_select ON stock_type_definitions
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- INSERT: tenants can only insert their own custom types (never system defaults)
DROP POLICY IF EXISTS stock_type_definitions_insert ON stock_type_definitions;
CREATE POLICY stock_type_definitions_insert ON stock_type_definitions
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  );

-- UPDATE: tenants can only update their own non-system types
DROP POLICY IF EXISTS stock_type_definitions_update ON stock_type_definitions;
CREATE POLICY stock_type_definitions_update ON stock_type_definitions
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  );

-- DELETE: tenants can only delete their own non-system types
DROP POLICY IF EXISTS stock_type_definitions_delete ON stock_type_definitions;
CREATE POLICY stock_type_definitions_delete ON stock_type_definitions
  FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND is_system = false
  );

COMMIT;
