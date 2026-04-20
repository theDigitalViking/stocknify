-- v6b — One active marketplace install per tenant+key.
-- Partial unique index: only active (deleted_at IS NULL, marketplace_key IS NOT NULL)
-- rows are unique. Soft-deleted installs do not conflict with a re-install.
-- Non-marketplace integrations (marketplace_key IS NULL) are excluded.
-- Idempotent: safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'integrations_tenant_marketplace_key_active_unique'
  ) THEN
    CREATE UNIQUE INDEX integrations_tenant_marketplace_key_active_unique
      ON integrations (tenant_id, marketplace_key)
      WHERE deleted_at IS NULL AND marketplace_key IS NOT NULL;
  END IF;
END
$$;
