import { Prisma, type PrismaClient } from '@prisma/client'

import { StockLevelInvariantError } from '../../lib/csv-errors.js'
import { isUniqueViolation } from '../../lib/db-errors.js'

export interface UpsertStockLevelInput {
  variantId: string
  locationId: string
  storageLocationId: string | null
  batchId: string | null
  stockType: string
  quantity: number
  source: string
  createdBy: string | null
}

// 'created' — new stock_levels row inserted; 'updated' — existing row's
// quantity changed (delta != 0); 'unchanged' — existing row's quantity equals
// the incoming quantity, but last_synced_at was bumped and a stock_movements
// row with delta=0 was still appended. Every outcome writes exactly one
// stock_movements row so the upload is visible in the movement history.
export type UpsertStockLevelOutcome = 'created' | 'updated' | 'unchanged'

// Upsert a stock level row and append a matching stock_movements record.
//
// Behaviour (2026-05-04, Cycle B): identical-quantity calls no longer
// short-circuit. The stock_levels row's `last_synced_at` is refreshed and a
// stock_movements row with delta=0 is written so every CSV upload is visible
// in the movement history. The Cycle E movement chart relies on a gapless
// trail; idempotency-as-write-skip would silently break that.
//
// All writes share a single interactive transaction. A PostgreSQL SAVEPOINT
// wraps the INSERT attempt so a P2002 (unique-constraint violation) can be
// rolled back locally without aborting the outer transaction — continuing
// after a raw statement error without a savepoint would hit
// "current transaction is aborted, commands ignored until end of transaction
// block" on the next statement.
//
// Race shape: Postgres does not take a gap lock under READ COMMITTED, so two
// concurrent imports for a tuple that has no existing stock row would both
// see no row and both try to INSERT. One wins; the loser's INSERT raises
// P2002 against the COALESCE-based unique index (see
// apps/api/src/db/sql/unique-stock-levels.sql). The savepoint lets the loser
// continue on the update path with the row the winner just created.
//
// `IS NOT DISTINCT FROM` on the nullable FKs matches the same NULL-equality
// semantics the COALESCE-based partial unique index uses.
export async function upsertStockLevel(
  db: PrismaClient,
  tenantId: string,
  row: UpsertStockLevelInput,
): Promise<UpsertStockLevelOutcome> {
  const newQty = new Prisma.Decimal(row.quantity)
  const now = new Date()

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SAVEPOINT upsert_stock_level`

    let wasInserted = false
    try {
      await tx.$executeRaw`
        INSERT INTO stock_levels (
          id, tenant_id, variant_id, location_id,
          storage_location_id, batch_id,
          stock_type, quantity, source, last_synced_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${tenantId}::uuid,
          ${row.variantId}::uuid,
          ${row.locationId}::uuid,
          ${row.storageLocationId}::uuid,
          ${row.batchId}::uuid,
          ${row.stockType},
          ${newQty},
          ${row.source},
          ${now},
          ${now},
          ${now}
        )
      `
      await tx.$executeRaw`RELEASE SAVEPOINT upsert_stock_level`
      wasInserted = true
    } catch (insertErr) {
      // Any INSERT error — unique or not — leaves the transaction in the
      // aborted state until `ROLLBACK TO SAVEPOINT` restores it. Doing a
      // bare `RELEASE SAVEPOINT` while aborted would itself fail and mask
      // the original error. Always ROLLBACK first, then RELEASE.
      //
      // Cleanup itself runs in a nested try/catch so a ROLLBACK/RELEASE
      // failure (e.g. connection interruption) does not shadow the original
      // insertErr. If cleanup fails we rethrow a wrapped error that carries
      // the original as `cause` — observability over brevity. Per coding
      // guideline 3d.
      try {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT upsert_stock_level`
        await tx.$executeRaw`RELEASE SAVEPOINT upsert_stock_level`
      } catch (cleanupErr) {
        // cleanupErr is the primary signal — it tells ops WHAT broke during
        // the rollback (connection loss, protocol state drift, etc.).
        // insertErr is preserved as a peer so the chain still reveals WHY
        // cleanup was attempted. AggregateError keeps `.message` stable so
        // result.errors[].reason does not leak driver/SQL details; the full
        // chain reaches server-side logs via pino's err serializer.
        throw new AggregateError(
          [cleanupErr, insertErr],
          'Savepoint cleanup failed during stock import',
        )
      }
      if (!isUniqueViolation(insertErr)) {
        // Unknown error: outer transaction aborts so neither the would-be
        // stock-level row nor the would-be movement row land.
        throw insertErr
      }
      // Unique violation: fall through to the update path below — the row
      // must exist (either pre-existing or created by a concurrent writer).
    }

    if (wasInserted) {
      await tx.stockMovement.create({
        data: {
          tenantId,
          variantId: row.variantId,
          locationId: row.locationId,
          storageLocationId: row.storageLocationId,
          batchId: row.batchId,
          stockType: row.stockType,
          quantityBefore: new Prisma.Decimal(0),
          quantityAfter: newQty,
          delta: newQty,
          movementType: 'sync',
          source: row.source,
          createdBy: row.createdBy,
        },
      })
      return 'created'
    }

    // Row exists (either pre-existing or just created by a concurrent
    // transaction). SELECT FOR UPDATE locks it so the movement row we emit
    // below reflects the quantity we actually wrote against.
    const existingRows = await tx.$queryRaw<Array<{ id: string; quantity: string }>>`
      SELECT id, quantity::text
      FROM stock_levels
      WHERE tenant_id    = ${tenantId}::uuid
        AND variant_id   = ${row.variantId}::uuid
        AND location_id  = ${row.locationId}::uuid
        AND storage_location_id IS NOT DISTINCT FROM ${row.storageLocationId}::uuid
        AND batch_id     IS NOT DISTINCT FROM ${row.batchId}::uuid
        AND stock_type   = ${row.stockType}
      FOR UPDATE
    `
    const existing = existingRows[0]
    if (!existing) {
      // Invariant violation: a P2002 was just raised for this tuple, so the
      // row must exist. The IDs ride along on the error object (pino's err
      // serializer captures readonly props) but the public message is the
      // safe fallback string.
      throw new StockLevelInvariantError({
        variantId: row.variantId,
        locationId: row.locationId,
        stockType: row.stockType,
      })
    }

    const currentQty = new Prisma.Decimal(existing.quantity)
    const delta = newQty.minus(currentQty)
    const isUnchanged = delta.isZero()

    // Touch the level row even when quantity is unchanged — last_synced_at
    // and source must reflect that the upload happened. The movement row
    // below carries delta=0 so the history shows a sync event without a
    // quantity change.
    await tx.stockLevel.update({
      where: { id: existing.id },
      data: { quantity: newQty, source: row.source, lastSyncedAt: now },
    })
    await tx.stockMovement.create({
      data: {
        tenantId,
        variantId: row.variantId,
        locationId: row.locationId,
        storageLocationId: row.storageLocationId,
        batchId: row.batchId,
        stockType: row.stockType,
        quantityBefore: currentQty,
        quantityAfter: newQty,
        delta,
        movementType: 'sync',
        source: row.source,
        createdBy: row.createdBy,
      },
    })
    return isUnchanged ? 'unchanged' : 'updated'
  })
}
