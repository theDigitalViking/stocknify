import { describe, expect, it } from 'vitest'

import { createTestTenant, testDb } from '../../../test/db.js'
import { upsertStockLevel } from '../upsert-stock-level.js'

interface Fixture {
  tenantId: string
  variantId: string
  locationId: string
}

async function setupFixture(): Promise<Fixture> {
  const { tenant } = await createTestTenant(testDb)

  const product = await testDb.product.create({
    data: {
      tenantId: tenant.id,
      name: 'Test Product',
      unit: 'piece',
      batchTracking: false,
    },
  })

  const variant = await testDb.productVariant.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      sku: 'TEST-SKU-1',
    },
  })

  const location = await testDb.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Test Warehouse',
      type: 'own_warehouse',
    },
  })

  return { tenantId: tenant.id, variantId: variant.id, locationId: location.id }
}

describe('upsertStockLevel — identical-quantity behaviour (Cycle B)', () => {
  it('appends a stock_movements row on every call, even when quantity is unchanged', async () => {
    const { tenantId, variantId, locationId } = await setupFixture()

    const first = await upsertStockLevel(testDb, tenantId, {
      variantId,
      locationId,
      storageLocationId: null,
      batchId: null,
      stockType: 'available',
      quantity: 10,
      source: 'csv',
      createdBy: null,
    })
    expect(first).toBe('created')

    // Same tuple, identical quantity — must NOT short-circuit.
    const second = await upsertStockLevel(testDb, tenantId, {
      variantId,
      locationId,
      storageLocationId: null,
      batchId: null,
      stockType: 'available',
      quantity: 10,
      source: 'csv',
      createdBy: null,
    })
    expect(second).toBe('unchanged')

    const movements = await testDb.stockMovement.findMany({
      where: { tenantId, variantId, locationId, stockType: 'available' },
      orderBy: { createdAt: 'asc' },
    })
    expect(movements).toHaveLength(2)

    // First movement: from 0 to 10 (delta = +10).
    expect(movements[0]?.quantityBefore.toString()).toBe('0')
    expect(movements[0]?.quantityAfter.toString()).toBe('10')
    expect(movements[0]?.delta.toString()).toBe('10')
    expect(movements[0]?.movementType).toBe('sync')

    // Second movement: identical quantity → delta = 0, but the row is still
    // written so the upload is visible in the history (Cycle E chart relies
    // on a gapless movement trail).
    expect(movements[1]?.quantityBefore.toString()).toBe('10')
    expect(movements[1]?.quantityAfter.toString()).toBe('10')
    expect(movements[1]?.delta.toString()).toBe('0')
    expect(movements[1]?.movementType).toBe('sync')

    // Stock level row stays at quantity=10, but last_synced_at advances on
    // both writes — the level was touched even when the quantity wasn't.
    const levels = await testDb.stockLevel.findMany({
      where: { tenantId, variantId, locationId, stockType: 'available' },
    })
    expect(levels).toHaveLength(1)
    expect(levels[0]?.quantity.toString()).toBe('10')
  })

  it('returns "updated" with non-zero delta when quantity actually changes', async () => {
    const { tenantId, variantId, locationId } = await setupFixture()

    await upsertStockLevel(testDb, tenantId, {
      variantId,
      locationId,
      storageLocationId: null,
      batchId: null,
      stockType: 'available',
      quantity: 10,
      source: 'csv',
      createdBy: null,
    })

    const outcome = await upsertStockLevel(testDb, tenantId, {
      variantId,
      locationId,
      storageLocationId: null,
      batchId: null,
      stockType: 'available',
      quantity: 25,
      source: 'csv',
      createdBy: null,
    })
    expect(outcome).toBe('updated')

    const movements = await testDb.stockMovement.findMany({
      where: { tenantId, variantId, locationId, stockType: 'available' },
      orderBy: { createdAt: 'asc' },
    })
    expect(movements).toHaveLength(2)
    expect(movements[1]?.delta.toString()).toBe('15')
  })
})
