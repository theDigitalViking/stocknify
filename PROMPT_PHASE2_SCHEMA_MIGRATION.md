# Claude Code Prompt — Phase 2: Schema Migration

> Paste this entire prompt into Claude Code at the start of a fresh session.
> Run this from the repo root. PROJECT.md must be present.

---

## Prompt (copy everything below this line)

---

Read `PROJECT.md` in full before doing anything. This prompt covers one task only:
replacing the existing Prisma schema and shared types with the finalized architecture.
Do not implement any API routes, services, or UI. Schema and types only.

---

### Context

The Phase 1 scaffold created a preliminary Prisma schema based on an earlier design.
That schema is now outdated. The finalized architecture is documented in PROJECT.md
sections 5 (Database Schema) and the Architecture Decisions block above it.

The key structural changes from the old schema are:
- `products` no longer holds `sku` — SKU moves to `product_variants`
- `stock_history` is replaced by `stock_movements` (richer audit trail)
- New tables: `product_variants`, `product_bundles`, `batches`, `storage_locations`, `stock_type_definitions`, `variant_location_config`
- `stock_levels` now references `variant_id` instead of `product_id`, and has optional `batch_id` and `storage_location_id`
- `rules` gains `condition_type`, `days_threshold`, and updated filter fields
- `rule_actions` gains `transition_to_stock_type`
- `tenants` gains `bundle_tracking` feature flag
- `alerts` references `variant_id` and optional `batch_id` instead of `product_id`

---

### Task 1 — Rewrite the Prisma schema

Replace the entire contents of `apps/api/src/db/schema.prisma` with a new schema
that implements every table in PROJECT.md section 5 exactly.

Requirements:
- All primary keys: UUID via `gen_random_uuid()`
- All timestamps: `@db.Timestamptz`
- Soft deletes: `deleted_at DateTime? @map("deleted_at") @db.Timestamptz` on applicable tables
- Naming: DB columns in `snake_case` via `@map()`, Prisma fields in `camelCase`
- Every tenant-scoped table gets `@@index([tenantId])`
- `stock_levels`: do NOT add a standard `@@unique` for the nullable FK combination —
  instead add a comment `// NOTE: Uniqueness is enforced by a custom COALESCE index.`
  `// See apps/api/src/db/migrations/manual/unique-stock-levels.sql`
- `rules`: do NOT add a DB check constraint in Prisma — add a comment:
  `// NOTE: Condition combination validity is enforced by a check constraint.`
  `// See apps/api/src/db/migrations/manual/rules-check-constraint.sql`
- `product_bundles`: include the table but add a model-level comment:
  `// Bundle business logic is deferred to Phase 3. Controlled by tenants.bundleTracking flag.`
- `stock_type_definitions`: `tenant_id` is nullable (null = system default)
- Include all relations with proper `@relation` annotations
- Every model gets `@@map("table_name")` with the correct snake_case table name

---

### Task 2 — Create the manual SQL migration files

Create the directory `apps/api/src/db/migrations/manual/` and add these two files:

**File 1: `unique-stock-levels.sql`**

```sql
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
```

**File 2: `rules-check-constraint.sql`**

```sql
-- Check constraint ensuring rule condition fields are consistent with condition_type.
-- This must be applied manually after the initial Prisma migration.

ALTER TABLE rules ADD CONSTRAINT rules_condition_fields_check CHECK (
  (
    condition_type = 'stock_level'
    AND operator IS NOT NULL
    AND threshold IS NOT NULL
  )
  OR
  (
    condition_type = 'days_until_expiry'
    AND days_threshold IS NOT NULL
  )
  OR
  (
    condition_type = 'stock_type_transition'
  )
);
```

**File 3: `rls-policies.sql`**

Create RLS policies for every tenant-scoped table. Pattern:

```sql
-- Enable RLS and add isolation policy for every tenant-scoped table.
-- Run this once after the initial migration, using the Supabase SQL editor
-- or a direct connection (not the pooler).

DO $$ DECLARE
  tables TEXT[] := ARRAY[
    'users', 'stock_type_definitions', 'products', 'product_variants',
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
-- Override policy for this table:
DROP POLICY IF EXISTS tenant_isolation ON stock_type_definitions;
CREATE POLICY tenant_isolation ON stock_type_definitions
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid);
```

---

### Task 3 — Seed system stock type definitions

Create `apps/api/src/db/seed/stock-type-definitions.sql` with INSERT statements
for the 8 system default stock types (tenant_id = NULL, is_system = true):

| key | label | color | sort_order |
|-----|-------|-------|------------|
| available | Available | #22c55e | 1 |
| physical | Physical | #3b82f6 | 2 |
| reserved | Reserved | #f59e0b | 3 |
| blocked | Blocked | #ef4444 | 4 |
| in_transit | In Transit | #8b5cf6 | 5 |
| pre_transit | Pre-transit | #a78bfa | 6 |
| damaged | Damaged | #f97316 | 7 |
| expired | Expired | #6b7280 | 8 |

Use `INSERT ... ON CONFLICT DO NOTHING` so it is safe to run multiple times.

---

### Task 4 — Update packages/shared

Rewrite `packages/shared/src/types/index.ts`, `packages/shared/src/schemas/index.ts`,
and `packages/shared/src/constants/index.ts` to match the new schema exactly.

**constants/index.ts changes:**
- Remove `STOCK_TYPES` as a fixed const array — stock types are now dynamic (loaded
  from DB). Keep only the system default keys as a `SYSTEM_STOCK_TYPE_KEYS` const
  for reference, but do NOT export it as a Zod enum used for validation.
- Add `MOVEMENT_TYPES`: `['inbound', 'outbound', 'correction', 'transfer', 'return', 'disposal', 'sync']`
- Add `CONDITION_TYPES`: `['stock_level', 'days_until_expiry', 'stock_type_transition']`
- Add `STORAGE_LOCATION_TYPES`: `['bin', 'shelf', 'zone', 'collection']`
- Add `EXPORT_STRATEGIES`: `['skip', 'dummy']`
- Update `STOCK_CHANGE_REASONS` → remove (replaced by `MOVEMENT_TYPES`)
- Update `PLAN_LIMITS` to include `stockMovementRetentionDays` (max 365 for all plans)

**types/index.ts changes:**
- Remove `Product` interface (with `sku`) — replace with `Product` (master data,
  no SKU) + `ProductVariant` (with `sku`, `attributes`, `isActive`) + `ProductBundle`
- Remove `StockHistory` — replace with `StockMovement`
- Add `Batch`, `StorageLocation`, `StockTypeDefinition`, `VariantLocationConfig`
- Update `StockLevel` to reference `variantId`, optional `storageLocationId`,
  optional `batchId`
- Update `Rule` with `conditionType`, `daysThreshold`, `variantFilter`, `batchFilter`
- Update `RuleAction` with optional `transitionToStockType`
- Update `Alert` with `variantId`, optional `batchId`, `triggeredValue`
- Update `AbstractConnector.StockData` interface to include optional `batchNumber`,
  `expiryDate`, `storageLocation`

**schemas/index.ts changes:**
- Remove `stockTypeSchema` as a fixed enum — replace with `z.string().min(1).max(50)`
  everywhere stock type is validated (runtime validation against DB happens in middleware)
- Add schemas for all new types: `BatchSchema`, `StorageLocationSchema`,
  `StockTypeDefinitionSchema`, `VariantLocationConfigSchema`, `StockMovementSchema`,
  `ProductVariantSchema`, `ProductBundleSchema`
- Update mutation schemas accordingly:
  - `createProductSchema`: remove `sku`, `barcode`; add `batchTracking`
  - `createProductVariantSchema`: new — `productId`, `sku`, `name`, `barcode`, `attributes`
  - `upsertStockLevelSchema`: replace `productId` with `variantId`; add optional
    `storageLocationId`, `batchId`
  - `createRuleSchema`: add `conditionType`, `daysThreshold`, `variantFilter`, `batchFilter`;
    make `stockType`, `operator`, `threshold` optional (required only for `stock_level` condition)
  - `createBatchSchema`: new — `productId`, `batchNumber`, `expiryDate?`, `manufacturedDate?`
  - `createStorageLocationSchema`: new — `locationId`, `name`, `type`, `trackInventory`

---

### Task 5 — Generate and apply the migration

```bash
# From repo root
cd apps/api

# Generate the migration (do not apply yet)
pnpm prisma migrate dev --name init_v2_schema --create-only

# Review the generated SQL in apps/api/src/db/migrations/
# Then apply:
pnpm prisma migrate dev

# Generate the Prisma client
pnpm prisma generate
```

After the migration runs successfully:
1. Apply the three manual SQL files against your Supabase database using the
   Supabase SQL editor (Settings → SQL Editor) in this order:
   a. `unique-stock-levels.sql`
   b. `rules-check-constraint.sql`
   c. `rls-policies.sql`
2. Run the seed file: `stock-type-definitions.sql`
3. Confirm by running `pnpm prisma studio` and verifying all tables are present

---

### Task 6 — Type-check everything

```bash
# From repo root
pnpm turbo typecheck
```

Fix all TypeScript errors before stopping. The routes in `apps/api/src/routes/`
will have type errors because they reference old types — update their type imports
to use the new shared types. Do not rewrite route logic, only fix the imports and
type annotations.

---

### Hard rules

- Do not implement any business logic, API handlers, or UI components
- Do not run `prisma migrate reset` — only `migrate dev`
- Do not delete the `apps/api/src/db/migrations/` directory
- If Prisma generates a migration that drops tables or columns from the old schema,
  that is expected and correct — confirm and proceed
- After `turbo typecheck` passes green, stop and report what was done and what
  manual steps remain (applying the SQL files)
