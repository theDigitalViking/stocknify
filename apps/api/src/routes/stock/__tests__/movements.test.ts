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
