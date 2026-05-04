import { describe, expect, it } from 'vitest'

import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

interface ProductFixture {
  tenantId: string
  userId: string
  productId: string
  primaryVariantId: string
  earlyDeletedVariantId: string
}

async function createDeletedProduct(): Promise<ProductFixture> {
  const { tenant, user } = await createTestTenant(testDb)

  const product = await testDb.product.create({
    data: {
      tenantId: tenant.id,
      name: 'Restore Test Product',
      unit: 'piece',
      batchTracking: false,
    },
  })

  const primaryVariant = await testDb.productVariant.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      sku: `RT-PRIMARY-${product.id.slice(0, 8)}`,
    },
  })

  // A variant that was already soft-deleted before the product itself was
  // deleted. It must NOT be restored when the product is restored.
  const earlyDeleted = new Date(Date.now() - 60_000)
  const earlyDeletedVariant = await testDb.productVariant.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      sku: `RT-EARLY-${product.id.slice(0, 8)}`,
      deletedAt: earlyDeleted,
    },
  })

  // Cascade-soft-delete the product + its still-active variants. Mirror the
  // DELETE handler so the test exercises the realistic cascade snapshot.
  const cascadeAt = new Date()
  await testDb.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { deletedAt: cascadeAt, deletedBy: user.id },
    })
    await tx.productVariant.updateMany({
      where: { productId: product.id, tenantId: tenant.id, deletedAt: null },
      data: { deletedAt: cascadeAt },
    })
  })

  return {
    tenantId: tenant.id,
    userId: user.id,
    productId: product.id,
    primaryVariantId: primaryVariant.id,
    earlyDeletedVariantId: earlyDeletedVariant.id,
  }
}

describe('POST /products/:id/restore (Cycle D)', () => {
  it('restores a soft-deleted product + its cascade variants (happy path)', async () => {
    const { tenantId, userId, productId, primaryVariantId, earlyDeletedVariantId } =
      await createDeletedProduct()

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/products/${productId}/restore`,
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as { data: { id: string; deletedAt: string | null } }
      expect(body.data.id).toBe(productId)
      expect(body.data.deletedAt).toBeNull()

      // Default GET /products lists the restored product (no includeDeleted).
      const list = await app.inject({
        method: 'GET',
        url: '/v1/products',
        headers: authedHeaders({ tenantId, userId, role: 'admin' }),
      })
      expect(list.statusCode).toBe(200)
      const listBody = list.json() as { data: Array<{ id: string }> }
      expect(listBody.data.map((p) => p.id)).toContain(productId)

      // Cascade variant restored; pre-existing soft-deleted variant left alone.
      const primary = await testDb.productVariant.findUnique({ where: { id: primaryVariantId } })
      const earlyDeleted = await testDb.productVariant.findUnique({
        where: { id: earlyDeletedVariantId },
      })
      expect(primary?.deletedAt).toBeNull()
      expect(earlyDeleted?.deletedAt).not.toBeNull()
    } finally {
      await app.close()
    }
  })

  it('returns 404 when the product is already active', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const product = await testDb.product.create({
      data: {
        tenantId: tenant.id,
        name: 'Active Product',
        unit: 'piece',
        batchTracking: false,
      },
    })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/products/${product.id}/restore`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })

      expect(res.statusCode).toBe(404)
      const body = res.json() as { error: { code: string } }
      expect(body.error.code).toBe('PRODUCT_NOT_FOUND')
    } finally {
      await app.close()
    }
  })

  it('returns 404 across tenants (RLS isolation)', async () => {
    const { tenantId: tenantAId, productId } = await createDeletedProduct()

    // Tenant B attempts to restore tenant A's deleted product.
    const { tenant: tenantB, user: userB } = await createTestTenant(testDb)

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/products/${productId}/restore`,
        headers: authedHeaders({ tenantId: tenantB.id, userId: userB.id, role: 'admin' }),
      })

      expect(res.statusCode).toBe(404)
      const body = res.json() as { error: { code: string } }
      expect(body.error.code).toBe('PRODUCT_NOT_FOUND')

      // Tenant A's product remains soft-deleted (the cross-tenant call must
      // not have flipped any rows).
      const stillDeleted = await testDb.product.findUnique({ where: { id: productId } })
      expect(stillDeleted?.deletedAt).not.toBeNull()
      expect(stillDeleted?.tenantId).toBe(tenantAId)
    } finally {
      await app.close()
    }
  })
})

describe('GET /products?includeDeleted= (Cycle D)', () => {
  it('omits soft-deleted products by default and includes them when includeDeleted=true', async () => {
    const { tenant, user } = await createTestTenant(testDb)

    const active = await testDb.product.create({
      data: {
        tenantId: tenant.id,
        name: 'Active',
        unit: 'piece',
        batchTracking: false,
      },
    })
    await testDb.productVariant.create({
      data: { tenantId: tenant.id, productId: active.id, sku: `ACT-${active.id.slice(0, 8)}` },
    })

    const deleted = await testDb.product.create({
      data: {
        tenantId: tenant.id,
        name: 'Deleted',
        unit: 'piece',
        batchTracking: false,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })
    await testDb.productVariant.create({
      data: {
        tenantId: tenant.id,
        productId: deleted.id,
        sku: `DEL-${deleted.id.slice(0, 8)}`,
        deletedAt: new Date(),
      },
    })

    const app = await buildTestApp()
    try {
      const def = await app.inject({
        method: 'GET',
        url: '/v1/products',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(def.statusCode).toBe(200)
      const defBody = def.json() as { data: Array<{ id: string; deletedAt: string | null }> }
      const defIds = defBody.data.map((p) => p.id)
      expect(defIds).toContain(active.id)
      expect(defIds).not.toContain(deleted.id)

      const incl = await app.inject({
        method: 'GET',
        url: '/v1/products?includeDeleted=true',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(incl.statusCode).toBe(200)
      const inclBody = incl.json() as { data: Array<{ id: string; deletedAt: string | null }> }
      const inclIds = inclBody.data.map((p) => p.id)
      expect(inclIds).toContain(active.id)
      expect(inclIds).toContain(deleted.id)
      const deletedRow = inclBody.data.find((p) => p.id === deleted.id)
      expect(deletedRow?.deletedAt).not.toBeNull()
    } finally {
      await app.close()
    }
  })
})
