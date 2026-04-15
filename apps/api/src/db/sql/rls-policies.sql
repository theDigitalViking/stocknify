-- Enable RLS and add isolation policy for every tenant-scoped table.
-- Run this once after the initial migration, using the Supabase SQL editor
-- or a direct connection (not the pooler).

DO $$ DECLARE
  tables TEXT[] := ARRAY[
    'users', 'products', 'product_variants',
    'product_bundles', 'batches', 'locations', 'storage_locations',
    'stock_levels', 'stock_movements', 'integrations', 'rules',
    'rule_actions', 'notification_channels', 'alerts',
    'variant_location_config', 'notification_deliveries'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.current_tenant_id'')::uuid)',
      t
    );
  END LOOP;
END $$;

-- stock_type_definitions has nullable tenant_id (system defaults have tenant_id = NULL).
-- Enable RLS separately with a policy that also allows system defaults.
ALTER TABLE stock_type_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON stock_type_definitions;
CREATE POLICY tenant_isolation ON stock_type_definitions
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid);
