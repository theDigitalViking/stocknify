import { describe, expect, it } from 'vitest'

import { authedHeaders } from './auth.js'
import { buildTestApp } from './build-app.js'
import { createTestTenant, testDb } from './db.js'

describe('test harness — smoke', () => {
  it('responds 200 to GET /v1/health without auth', async () => {
    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/health' })
      expect(res.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('responds 200 with empty data for a fresh tenant on GET /v1/products', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/products',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { data: unknown[] }
      expect(body.data).toEqual([])
    } finally {
      await app.close()
    }
  })
})
