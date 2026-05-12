import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

interface MovementsFixture {
  tenantId: string
  userId: string
  productId: string
  variantAId: string
  variantBId: string
  locationId: string
}

async function createMovementsFixture(): Promise<MovementsFixture> {
  const { tenant, user } = await createTestTenant(testDb)

  const product = await testDb.product.create({
    data: {
      tenantId: tenant.id,
      name: 'Movements Test Product',
      unit: 'piece',
      batchTracking: false,
    },
  })

  const variantA = await testDb.productVariant.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      sku: `MOV-A-${product.id.slice(0, 8)}`,
    },
  })

  const variantB = await testDb.productVariant.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      sku: `MOV-B-${product.id.slice(0, 8)}`,
    },
  })

  const location = await testDb.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Movements Warehouse',
      type: 'own_warehouse',
    },
  })

  return {
    tenantId: tenant.id,
    userId: user.id,
    productId: product.id,
    variantAId: variantA.id,
    variantBId: variantB.id,
    locationId: location.id,
  }
}

interface SeedMovement {
  tenantId: string
  variantId: string
  locationId: string
  stockType?: string
  quantityBefore?: number
  quantityAfter?: number
  movementType?: string
  createdAt?: Date
}

async function seedMovement(seed: SeedMovement): Promise<{ id: string }> {
  const before = seed.quantityBefore ?? 0
  const after = seed.quantityAfter ?? 10
  const created = await testDb.stockMovement.create({
    data: {
      tenantId: seed.tenantId,
      variantId: seed.variantId,
      locationId: seed.locationId,
      stockType: seed.stockType ?? 'available',
      quantityBefore: before,
      quantityAfter: after,
      delta: after - before,
      movementType: seed.movementType ?? 'sync',
      source: 'csv',
      ...(seed.createdAt ? { createdAt: seed.createdAt } : {}),
    },
  })
  return { id: created.id }
}

interface MovementResponseRow {
  id: string
  variantId: string
  variantSku: string
  productId: string
  productName: string
  locationId: string
  locationName: string
  stockType: string
  quantity: number
  delta: number
  movementType: string
  batchNumber: string | null
  createdAt: string
}

interface MovementResponseBody {
  data: MovementResponseRow[]
  meta: { total: number; page: number; perPage: number }
}

describe('GET /stock/movements (Cycle E)', () => {
  it('returns an empty envelope for a new tenant with no movements', async () => {
    const { tenant, user } = await createTestTenant(testDb)

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      expect(body.data).toEqual([])
      expect(body.meta.total).toBe(0)
      expect(body.meta.page).toBe(1)
    } finally {
      await app.close()
    }
  })

  it('filters by variantId and by createdAt date range', async () => {
    const { tenantId, userId, variantAId, variantBId, locationId } =
      await createMovementsFixture()

    const oldDate = new Date('2026-01-01T00:00:00Z')
    const recentDate = new Date('2026-04-01T00:00:00Z')
    const newestDate = new Date('2026-05-01T00:00:00Z')

    await seedMovement({
      tenantId,
      variantId: variantAId,
      locationId,
      quantityAfter: 10,
      createdAt: oldDate,
    })
    await seedMovement({
      tenantId,
      variantId: variantAId,
      locationId,
      quantityBefore: 10,
      quantityAfter: 25,
      createdAt: newestDate,
    })
    await seedMovement({
      tenantId,
      variantId: variantBId,
      locationId,
      quantityAfter: 5,
      createdAt: recentDate,
    })

    const app = await buildTestApp()
    try {
      // Filter by variantId — only variant A's two movements come back.
      const byVariant = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?variantId=${variantAId}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(byVariant.statusCode).toBe(200)
      const variantBody = byVariant.json() as MovementResponseBody
      expect(variantBody.meta.total).toBe(2)
      expect(variantBody.data).toHaveLength(2)
      expect(variantBody.data.every((m) => m.variantId === variantAId)).toBe(true)
      const [firstRow, secondRow] = variantBody.data
      // Default sortDir=desc — newest first.
      expect(new Date(firstRow?.createdAt ?? 0).getTime()).toBeGreaterThan(
        new Date(secondRow?.createdAt ?? 0).getTime(),
      )
      // Denormalized fields populated.
      expect(firstRow?.variantSku).toMatch(/^MOV-A-/)
      expect(firstRow?.productName).toBe('Movements Test Product')
      expect(firstRow?.locationName).toBe('Movements Warehouse')

      // Filter by date range — only the 2026-04 movement (variant B) qualifies.
      const byDate = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements?from=2026-03-01T00:00:00Z&to=2026-04-30T23:59:59Z',
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(byDate.statusCode).toBe(200)
      const dateBody = byDate.json() as MovementResponseBody
      expect(dateBody.meta.total).toBe(1)
      expect(dateBody.data).toHaveLength(1)
      expect(dateBody.data[0]?.variantId).toBe(variantBId)
    } finally {
      await app.close()
    }
  })

  it('paginates results with perPage', async () => {
    const { tenantId, userId, variantAId, locationId } = await createMovementsFixture()

    await seedMovement({
      tenantId,
      variantId: variantAId,
      locationId,
      createdAt: new Date('2026-05-01T00:00:00Z'),
    })
    await seedMovement({
      tenantId,
      variantId: variantAId,
      locationId,
      createdAt: new Date('2026-05-02T00:00:00Z'),
    })
    await seedMovement({
      tenantId,
      variantId: variantAId,
      locationId,
      createdAt: new Date('2026-05-03T00:00:00Z'),
    })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements?perPage=2',
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      expect(body.data).toHaveLength(2)
      expect(body.meta.total).toBe(3)
      expect(body.meta.page).toBe(1)
      expect(body.meta.perPage).toBe(2)

      const second = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements?perPage=2&page=2',
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(second.statusCode).toBe(200)
      const secondBody = second.json() as MovementResponseBody
      expect(secondBody.data).toHaveLength(1)
      expect(secondBody.meta.total).toBe(3)
      expect(secondBody.meta.page).toBe(2)
    } finally {
      await app.close()
    }
  })

  it('filters by storageLocationId (Cycle 2-F review fix)', async () => {
    const { tenantId, userId, variantAId, locationId } = await createMovementsFixture()

    // Two bins under the same warehouse; we want the filter to scope results
    // to a single bin so a deep-link from the stock list narrows correctly.
    const binA = await testDb.storageLocation.create({
      data: { tenantId, locationId, name: 'Bin A', type: 'shelf' },
    })
    const binB = await testDb.storageLocation.create({
      data: { tenantId, locationId, name: 'Bin B', type: 'shelf' },
    })

    await seedMovement({
      tenantId,
      variantId: variantAId,
      locationId,
    })
    // Bin-scoped seeds — storageLocationId comes from the create call below
    // so we keep the helper signature unchanged.
    await testDb.stockMovement.create({
      data: {
        tenantId,
        variantId: variantAId,
        locationId,
        storageLocationId: binA.id,
        stockType: 'available',
        quantityBefore: 0,
        quantityAfter: 7,
        delta: 7,
        movementType: 'sync',
        source: 'csv',
      },
    })
    await testDb.stockMovement.create({
      data: {
        tenantId,
        variantId: variantAId,
        locationId,
        storageLocationId: binB.id,
        stockType: 'available',
        quantityBefore: 0,
        quantityAfter: 3,
        delta: 3,
        movementType: 'sync',
        source: 'csv',
      },
    })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?storageLocationId=${binA.id}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      // Only the bin-A movement matches; the bin-agnostic and bin-B rows
      // are excluded.
      expect(body.meta.total).toBe(1)
      expect(body.data).toHaveLength(1)
      expect(body.data[0]?.delta).toBe(7)
    } finally {
      await app.close()
    }
  })

  it('filters by comma-separated locationIds (Cycle 4-E)', async () => {
    const { tenantId, userId, variantAId } = await createMovementsFixture()

    // Two distinct warehouses; we want the comma-separated filter to scope
    // results to multiple specific locations at once.
    const locationA = await testDb.location.create({
      data: { tenantId, name: 'Warehouse A', type: 'own_warehouse' },
    })
    const locationB = await testDb.location.create({
      data: { tenantId, name: 'Warehouse B', type: 'own_warehouse' },
    })
    const locationC = await testDb.location.create({
      data: { tenantId, name: 'Warehouse C', type: 'own_warehouse' },
    })

    await seedMovement({ tenantId, variantId: variantAId, locationId: locationA.id })
    await seedMovement({ tenantId, variantId: variantAId, locationId: locationB.id })
    await seedMovement({ tenantId, variantId: variantAId, locationId: locationC.id })

    const app = await buildTestApp()
    try {
      // Both A and B → two rows back.
      const both = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?locationIds=${locationA.id},${locationB.id}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(both.statusCode).toBe(200)
      const bothBody = both.json() as MovementResponseBody
      expect(bothBody.meta.total).toBe(2)
      const returnedIds = new Set(bothBody.data.map((m) => m.locationId))
      expect(returnedIds.has(locationA.id)).toBe(true)
      expect(returnedIds.has(locationB.id)).toBe(true)
      expect(returnedIds.has(locationC.id)).toBe(false)

      // Single value in the plural form behaves like the singular.
      const justA = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?locationIds=${locationA.id}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(justA.statusCode).toBe(200)
      const justABody = justA.json() as MovementResponseBody
      expect(justABody.meta.total).toBe(1)
      expect(justABody.data[0]?.locationId).toBe(locationA.id)
    } finally {
      await app.close()
    }
  })

  it('filters by comma-separated stockTypes (Cycle 4-E)', async () => {
    const { tenantId, userId, variantAId, locationId } = await createMovementsFixture()

    await seedMovement({ tenantId, variantId: variantAId, locationId, stockType: 'available' })
    await seedMovement({ tenantId, variantId: variantAId, locationId, stockType: 'reserved' })
    await seedMovement({ tenantId, variantId: variantAId, locationId, stockType: 'damaged' })

    const app = await buildTestApp()
    try {
      const multi = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements?stockTypes=available,reserved',
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(multi.statusCode).toBe(200)
      const multiBody = multi.json() as MovementResponseBody
      expect(multiBody.meta.total).toBe(2)
      const types = new Set(multiBody.data.map((m) => m.stockType))
      expect(types).toEqual(new Set(['available', 'reserved']))

      const onlyAvailable = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements?stockTypes=available',
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(onlyAvailable.statusCode).toBe(200)
      const onlyAvailableBody = onlyAvailable.json() as MovementResponseBody
      expect(onlyAvailableBody.meta.total).toBe(1)
      expect(onlyAvailableBody.data[0]?.stockType).toBe('available')
    } finally {
      await app.close()
    }
  })

  it('keeps the singular locationId param working (Cycle 4-E back-compat)', async () => {
    const { tenantId, userId, variantAId } = await createMovementsFixture()

    const locationA = await testDb.location.create({
      data: { tenantId, name: 'Warehouse A', type: 'own_warehouse' },
    })
    const locationB = await testDb.location.create({
      data: { tenantId, name: 'Warehouse B', type: 'own_warehouse' },
    })

    await seedMovement({ tenantId, variantId: variantAId, locationId: locationA.id })
    await seedMovement({ tenantId, variantId: variantAId, locationId: locationB.id })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?locationId=${locationA.id}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      expect(body.meta.total).toBe(1)
      expect(body.data[0]?.locationId).toBe(locationA.id)
    } finally {
      await app.close()
    }
  })

  it('plural locationIds wins over singular locationId (Cycle 4-E)', async () => {
    const { tenantId, userId, variantAId } = await createMovementsFixture()

    const locationA = await testDb.location.create({
      data: { tenantId, name: 'Warehouse A', type: 'own_warehouse' },
    })
    const locationB = await testDb.location.create({
      data: { tenantId, name: 'Warehouse B', type: 'own_warehouse' },
    })

    await seedMovement({ tenantId, variantId: variantAId, locationId: locationA.id })
    await seedMovement({ tenantId, variantId: variantAId, locationId: locationB.id })

    const app = await buildTestApp()
    try {
      // Caller passes both: singular says A only, plural says A+B. Plural must
      // win so callers carrying legacy deep-link params still get the broader
      // filter when they ALSO send the multi-select form.
      const res = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?locationId=${locationA.id}&locationIds=${locationA.id},${locationB.id}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      expect(body.meta.total).toBe(2)
      const ids = new Set(body.data.map((m) => m.locationId))
      expect(ids).toEqual(new Set([locationA.id, locationB.id]))
    } finally {
      await app.close()
    }
  })

  it('rejects oversized CSV filter lists (Cycle 4-E Codex review fix)', async () => {
    const { tenantId, userId } = await createMovementsFixture()

    const app = await buildTestApp()
    try {
      // 101 valid UUIDs in the locationIds list — over the 100-item cap.
      const tooMany = Array.from({ length: 101 }, () => randomUUID()).join(',')
      const res = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?locationIds=${tooMany}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json() as { error: { code: string; message: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.message).toMatch(/maximum of 100 items/)
    } finally {
      await app.close()
    }
  })

  it('rejects overlong CSV filter strings (Cycle 4-E Codex review fix)', async () => {
    const { tenantId, userId } = await createMovementsFixture()

    const app = await buildTestApp()
    try {
      // 8193 bytes of dummy data — over the 8192-char schema cap. The schema
      // rejects before the post-parse element-count check fires.
      const massive = 'a'.repeat(8193)
      const res = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?stockTypes=${massive}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json() as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    } finally {
      await app.close()
    }
  })

  it('deduplicates repeated values in CSV filter lists (Cycle 4-E Codex review fix)', async () => {
    const { tenantId, userId, variantAId, locationId } = await createMovementsFixture()
    // One row at this location — duplicates in the filter list must not
    // double-count it on the way out.
    await seedMovement({ tenantId, variantId: variantAId, locationId })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/stock/movements?locationIds=${locationId},${locationId},${locationId}`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      // One row returned — dedup happens before the Prisma `in` clause, so
      // result count is consistent and SQL parameter count is bounded.
      expect(body.meta.total).toBe(1)
      expect(body.data).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it('isolates movements across tenants (RLS)', async () => {
    const { tenantId: tenantAId, variantAId, locationId } = await createMovementsFixture()
    await seedMovement({
      tenantId: tenantAId,
      variantId: variantAId,
      locationId,
    })

    // Tenant B has no movements of their own; querying must not leak A's row.
    const { tenant: tenantB, user: userB } = await createTestTenant(testDb)

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/stock/movements',
        headers: authedHeaders({ tenantId: tenantB.id, userId: userB.id, role: 'admin' }),
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as MovementResponseBody
      expect(body.data).toEqual([])
      expect(body.meta.total).toBe(0)
    } finally {
      await app.close()
    }
  })
})
