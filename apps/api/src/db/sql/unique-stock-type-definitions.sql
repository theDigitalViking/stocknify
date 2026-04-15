-- Partial unique indexes for stock_type_definitions.
--
-- WHY:
-- The Prisma @@unique([tenantId, key]) does not enforce uniqueness when
-- tenantId is NULL — PostgreSQL treats NULL as distinct in standard UNIQUE
-- constraints, allowing duplicate system-default keys.
--
-- SOLUTION: Two partial unique indexes — one for system defaults (NULL tenant),
-- one for tenant-custom types (non-NULL tenant). Together they cover all cases.
--
-- Both are idempotent via IF NOT EXISTS.

-- System defaults: only one row per key allowed when tenant_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS stock_type_definitions_system_key_unique
ON stock_type_definitions (key)
WHERE tenant_id IS NULL;

-- Tenant-custom types: one row per (tenant_id, key) combination
CREATE UNIQUE INDEX IF NOT EXISTS stock_type_definitions_tenant_key_unique
ON stock_type_definitions (tenant_id, key)
WHERE tenant_id IS NOT NULL;
