-- Custom UNIQUE index for stock_levels using COALESCE to handle NULL foreign keys.
-- PostgreSQL treats NULLs as distinct in standard UNIQUE constraints, which would
-- allow duplicate batch-agnostic or storage-location-agnostic rows.
-- This index must be applied manually after the initial Prisma migration.

CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_unique_idx
ON stock_levels (
  tenant_id,
  variant_id,
  location_id,
  COALESCE(storage_location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(batch_id,            '00000000-0000-0000-0000-000000000000'::uuid),
  stock_type
);
