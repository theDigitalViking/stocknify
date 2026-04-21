import type { PrismaClient } from '@prisma/client'

/**
 * Remove tenant-owned StockTypeDefinitions that are no longer referenced by
 * any stock_level row.
 *
 * System defaults (`tenant_id IS NULL`, or `is_system = true`) are never
 * touched — they exist for all tenants even when a particular tenant has no
 * stock in that type yet.
 *
 * Executed as a single DELETE with a correlated NOT IN subquery so the
 * read-then-delete race window is closed: a concurrent writer that inserts
 * a `stock_levels` row for a key between the subquery and the DELETE will
 * either be visible to the subquery (and the key is spared) or not yet
 * committed (and the DELETE targets a still-unused key). Orphan sweeps
 * cannot strand a newly-live key.
 *
 * Intended to run after any bulk operation that deletes stock_levels:
 *   - CSV stock import completion
 *   - Product deletion (stock_levels are hard-deleted; orphaned types follow)
 *
 * Safe to call repeatedly — a no-op when nothing is orphaned.
 */
export async function cleanupOrphanedStockTypeDefinitions(
  db: PrismaClient,
  tenantId: string,
): Promise<void> {
  await db.$executeRaw`
    DELETE FROM stock_type_definitions
    WHERE tenant_id = ${tenantId}::uuid
      AND is_system = false
      AND key NOT IN (
        SELECT DISTINCT stock_type
        FROM stock_levels
        WHERE tenant_id = ${tenantId}::uuid
      )
  `
}
