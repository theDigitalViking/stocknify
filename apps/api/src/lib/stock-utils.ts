import type { PrismaClient } from '@prisma/client'

/**
 * Remove tenant-owned StockTypeDefinitions that are no longer referenced by
 * any stock_level row.
 *
 * System defaults (`tenant_id IS NULL`, or `is_system = true`) are never
 * touched — they exist for all tenants even when a particular tenant has no
 * stock in that type yet.
 *
 * Intended to run after any bulk operation that deletes stock_levels:
 *   - CSV stock import completion (a key that was auto-registered but never
 *     actually used gets reaped)
 *   - Product deletion (stock_levels are hard-deleted; orphaned types follow)
 *
 * Safe to call repeatedly — a no-op when nothing is orphaned.
 */
export async function cleanupOrphanedStockTypeDefinitions(
  db: PrismaClient,
  tenantId: string,
): Promise<void> {
  const tenantDefs = await db.stockTypeDefinition.findMany({
    where: { tenantId, isSystem: false },
    select: { id: true, key: true },
  })
  if (tenantDefs.length === 0) return

  const usedLevels = await db.stockLevel.findMany({
    where: {
      tenantId,
      stockType: { in: tenantDefs.map((d) => d.key) },
    },
    select: { stockType: true },
    distinct: ['stockType'],
  })
  const usedKeys = new Set(usedLevels.map((l) => l.stockType))

  const orphanIds = tenantDefs.filter((d) => !usedKeys.has(d.key)).map((d) => d.id)
  if (orphanIds.length === 0) return

  await db.stockTypeDefinition.deleteMany({
    where: { id: { in: orphanIds }, tenantId },
  })
}
