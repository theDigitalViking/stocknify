-- Unique index for stock_levels using partial indexes instead of COALESCE sentinel.
--
-- WHY NOT COALESCE WITH SENTINEL UUID:
-- Using '00000000-0000-0000-0000-000000000000' as a NULL sentinel is unsafe:
-- a real FK row with that UUID becomes indistinguishable from NULL in the index,
-- causing false uniqueness conflicts. Partial indexes are the correct approach.
--
-- APPROACH: Four partial unique indexes covering all NULL/non-NULL combinations
-- of the two nullable FKs (storage_location_id and batch_id).
-- Together they enforce the same uniqueness invariant without sentinel collisions.
--
-- All indexes are created with IF NOT EXISTS (idempotent).

-- Case 1: both storage_location_id and batch_id are NULL
CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_unique_no_storage_no_batch
ON stock_levels (tenant_id, variant_id, location_id, stock_type)
WHERE storage_location_id IS NULL AND batch_id IS NULL;

-- Case 2: storage_location_id is set, batch_id is NULL
CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_unique_with_storage_no_batch
ON stock_levels (tenant_id, variant_id, location_id, storage_location_id, stock_type)
WHERE storage_location_id IS NOT NULL AND batch_id IS NULL;

-- Case 3: storage_location_id is NULL, batch_id is set
CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_unique_no_storage_with_batch
ON stock_levels (tenant_id, variant_id, location_id, batch_id, stock_type)
WHERE storage_location_id IS NULL AND batch_id IS NOT NULL;

-- Case 4: both storage_location_id and batch_id are set
CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_unique_with_storage_with_batch
ON stock_levels (tenant_id, variant_id, location_id, storage_location_id, batch_id, stock_type)
WHERE storage_location_id IS NOT NULL AND batch_id IS NOT NULL;
