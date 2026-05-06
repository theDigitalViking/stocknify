-- RLS policies for schema additions in Cycle 3-C.
-- Idempotent: drops existing policies before recreating.
-- Run after the Prisma migration via run-manual-migrations.ts.

BEGIN;

ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON import_runs;
CREATE POLICY tenant_isolation ON import_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
