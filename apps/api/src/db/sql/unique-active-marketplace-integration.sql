-- v6b — One active marketplace install per tenant+key.
-- Partial unique index: only active (deleted_at IS NULL, marketplace_key IS NOT NULL)
-- rows are unique. Soft-deleted installs do not conflict with a re-install.
-- Non-marketplace integrations (marketplace_key IS NULL) are excluded.
-- Idempotent: safe to re-run.

-- Step 1 — Deduplicate any pre-existing active duplicates before the index
-- goes in. Without this step CREATE UNIQUE INDEX would fail on databases
-- that raced past the application-level check. Survivor selection:
--   1. prefer is_enabled = true  (keep the row tenants can actually use)
--   2. then most recently updated (latest configuration change wins)
--   3. then highest id           (stable, deterministic tiebreaker)
-- On a clean DB this UPDATE matches zero rows.
UPDATE integrations
SET deleted_at = NOW()
WHERE marketplace_key IS NOT NULL
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (tenant_id, marketplace_key) id
    FROM integrations
    WHERE marketplace_key IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY
      tenant_id,
      marketplace_key,
      is_enabled DESC,
      updated_at DESC,
      id DESC
  );

-- Step 2 — Create the partial unique index.
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
