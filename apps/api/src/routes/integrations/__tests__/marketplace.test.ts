import { describe, expect, it } from 'vitest'

import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

interface CatalogEntry {
  key: string
  name: string
  description: string
  category: string
  logoUrl: string
  installCount: number
  installations: Array<{
    integrationId: string
    instanceName: string
    isEnabled: boolean
    installedAt: string
  }>
}

interface CatalogBody {
  data: CatalogEntry[]
}

interface InstallBody {
  data: {
    integration: { id: string; name: string; marketplaceKey: string | null }
    lockedTemplates: unknown[]
  }
}

describe('GET /v1/integrations/marketplace/catalog (Cycle 4-A)', () => {
  it('excludes the SFTP entry (internal, not in marketplace)', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/integrations/marketplace/catalog',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as CatalogBody
      expect(body.data.find((e) => e.key === 'sftp')).toBeUndefined()
      expect(body.data.find((e) => e.key === 'ftp')).toBeUndefined()
      expect(body.data.find((e) => e.key === 'ftps')).toBeUndefined()
      // Sanity: at least one expected public entry IS present.
      expect(body.data.find((e) => e.key === 'shopify')).toBeDefined()
    } finally {
      await app.close()
    }
  })

  it('always uses the static catalog name + description, never the instance name', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      // Install Shopify with a custom instance name.
      const installRes = await app.inject({
        method: 'POST',
        url: '/v1/integrations/marketplace/shopify/install',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'My Shop' },
      })
      expect(installRes.statusCode).toBe(201)

      const catalogRes = await app.inject({
        method: 'GET',
        url: '/v1/integrations/marketplace/catalog',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(catalogRes.statusCode).toBe(200)
      const body = catalogRes.json() as CatalogBody
      const shopify = body.data.find((e) => e.key === 'shopify')
      expect(shopify).toBeDefined()
      expect(shopify?.name).toBe('Shopify')
      expect(shopify?.description).toBe('Sync products and inventory with your Shopify store.')
      expect(shopify?.installCount).toBe(1)
      expect(shopify?.installations).toHaveLength(1)
      expect(shopify?.installations[0]?.instanceName).toBe('My Shop')
    } finally {
      await app.close()
    }
  })

  it('supports multi-install: same key installed twice surfaces as installCount=2', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/v1/integrations/marketplace/shopify/install',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'Shop A' },
      })
      expect(first.statusCode).toBe(201)
      const second = await app.inject({
        method: 'POST',
        url: '/v1/integrations/marketplace/shopify/install',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'Shop B' },
      })
      // No more ALREADY_INSTALLED 409 — second install succeeds.
      expect(second.statusCode).toBe(201)

      const catalogRes = await app.inject({
        method: 'GET',
        url: '/v1/integrations/marketplace/catalog',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      const shopify = (catalogRes.json() as CatalogBody).data.find((e) => e.key === 'shopify')
      expect(shopify?.installCount).toBe(2)
      const names = shopify?.installations.map((i) => i.instanceName) ?? []
      expect(names).toContain('Shop A')
      expect(names).toContain('Shop B')
    } finally {
      await app.close()
    }
  })

  it('does not duplicate locked mapping templates on re-install of the same key', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      // Even with no fixedTemplates on the Shopify entry today, the re-install
      // path must not create stray templates. We assert template count stays
      // bounded across multiple installs of the same key.
      await app.inject({
        method: 'POST',
        url: '/v1/integrations/marketplace/shopify/install',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'A' },
      })
      await app.inject({
        method: 'POST',
        url: '/v1/integrations/marketplace/shopify/install',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'B' },
      })
      const templates = await testDb.csvMappingTemplate.findMany({
        where: {
          tenantId: tenant.id,
          isLocked: true,
          marketplaceKey: 'shopify',
        },
      })
      // Shopify currently ships no fixedTemplates; once it does, both installs
      // must still share one set, not duplicate.
      expect(templates.length).toBeLessThanOrEqual(1)
    } finally {
      await app.close()
    }
  })
})

describe('DELETE /v1/integrations/:id (Cycle 4-A — per-instance uninstall)', () => {
  it('uninstalls a single installation by ID and leaves siblings intact', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const headers = authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' })
      const a = (
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/marketplace/shopify/install',
          headers,
          payload: { name: 'A' },
        })
      ).json() as InstallBody
      const b = (
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/marketplace/shopify/install',
          headers,
          payload: { name: 'B' },
        })
      ).json() as InstallBody

      // Uninstall the FIRST install by ID.
      const del = await app.inject({
        method: 'DELETE',
        url: `/v1/integrations/${a.data.integration.id}`,
        headers,
      })
      expect(del.statusCode).toBe(204)

      const catalogRes = await app.inject({
        method: 'GET',
        url: '/v1/integrations/marketplace/catalog',
        headers,
      })
      const shopify = (catalogRes.json() as CatalogBody).data.find((e) => e.key === 'shopify')
      expect(shopify?.installCount).toBe(1)
      // The surviving installation is the OTHER one (B), not the uninstalled A.
      expect(shopify?.installations[0]?.integrationId).toBe(b.data.integration.id)
      expect(shopify?.installations[0]?.instanceName).toBe('B')
    } finally {
      await app.close()
    }
  })

  it('returns 404 for an integration in a different tenant (no existence leak)', async () => {
    const a = await createTestTenant(testDb, { slug: `tenant-a-${Date.now()}` })
    const b = await createTestTenant(testDb, { slug: `tenant-b-${Date.now()}` })
    const app = await buildTestApp()
    try {
      const installed = (
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/marketplace/shopify/install',
          headers: authedHeaders({ tenantId: a.tenant.id, userId: a.user.id, role: 'admin' }),
          payload: { name: 'A' },
        })
      ).json() as InstallBody

      // Tenant B attempts to delete tenant A's integration → 404.
      const del = await app.inject({
        method: 'DELETE',
        url: `/v1/integrations/${installed.data.integration.id}`,
        headers: authedHeaders({ tenantId: b.tenant.id, userId: b.user.id, role: 'admin' }),
      })
      expect(del.statusCode).toBe(404)

      // Tenant A's row is still active.
      const stillActive = await testDb.integration.findFirst({
        where: { id: installed.data.integration.id, deletedAt: null },
      })
      expect(stillActive).not.toBeNull()
    } finally {
      await app.close()
    }
  })
})
