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

describe('DELETE /v1/integrations/marketplace/:key/uninstall (Cycle 4-A — retired)', () => {
  it('returns 410 ENDPOINT_REMOVED — bulk key-scoped uninstall is gone (Codex review fix F3)', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const headers = authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' })
      // Even with an active install, the legacy endpoint must NOT touch it.
      const seed = (
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/marketplace/shopify/install',
          headers,
          payload: { name: 'Seed' },
        })
      ).json() as InstallBody

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/integrations/marketplace/shopify/uninstall',
        headers,
      })
      expect(res.statusCode).toBe(410)
      expect((res.json() as { error: { code: string } }).error.code).toBe('ENDPOINT_REMOVED')

      // The original install is still active — the retired endpoint never
      // touched the DB. This is the entire point of the 410: removing the
      // multi-install footgun.
      const stillActive = await testDb.integration.findFirst({
        where: { id: seed.data.integration.id, deletedAt: null },
      })
      expect(stillActive).not.toBeNull()
    } finally {
      await app.close()
    }
  })
})

describe('csv_mapping_templates_locked_unique partial index (Cycle 4-A Codex review fix F1)', () => {
  it('rejects a second locked template with the same (tenant_id, marketplace_key, name)', async () => {
    const { tenant } = await createTestTenant(testDb)
    // The catalog ships no fixedTemplates today, so the install path doesn't
    // exercise the constraint live. The DB-level safety net is still the
    // load-bearing protection against duplicate locked templates if a future
    // catalog entry adds fixedTemplates. Insert two rows with the same
    // (tenant, marketplace_key, name) and expect the second to fail.
    await testDb.csvMappingTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Locked stock template',
        direction: 'import',
        resourceType: 'stock',
        delimiter: ',',
        encoding: 'utf-8',
        hasHeaderRow: true,
        columnMappings: [] as unknown as object,
        defaultValues: {} as object,
        isLocked: true,
        marketplaceKey: 'shopify',
      },
    })
    await expect(
      testDb.csvMappingTemplate.create({
        data: {
          tenantId: tenant.id,
          name: 'Locked stock template',
          direction: 'import',
          resourceType: 'stock',
          delimiter: ',',
          encoding: 'utf-8',
          hasHeaderRow: true,
          columnMappings: [] as unknown as object,
          defaultValues: {} as object,
          isLocked: true,
          marketplaceKey: 'shopify',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('allows two locked templates with different names under the same marketplace key', async () => {
    const { tenant } = await createTestTenant(testDb)
    await testDb.csvMappingTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Stock import',
        direction: 'import',
        resourceType: 'stock',
        delimiter: ',',
        encoding: 'utf-8',
        hasHeaderRow: true,
        columnMappings: [] as unknown as object,
        defaultValues: {} as object,
        isLocked: true,
        marketplaceKey: 'shopify',
      },
    })
    await expect(
      testDb.csvMappingTemplate.create({
        data: {
          tenantId: tenant.id,
          name: 'Product import',
          direction: 'import',
          resourceType: 'products',
          delimiter: ',',
          encoding: 'utf-8',
          hasHeaderRow: true,
          columnMappings: [] as unknown as object,
          defaultValues: {} as object,
          isLocked: true,
          marketplaceKey: 'shopify',
        },
      }),
    ).resolves.toBeTruthy()
  })

  it('does not block a non-locked template with the same name (partial index)', async () => {
    const { tenant } = await createTestTenant(testDb)
    await testDb.csvMappingTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Stock import',
        direction: 'import',
        resourceType: 'stock',
        delimiter: ',',
        encoding: 'utf-8',
        hasHeaderRow: true,
        columnMappings: [] as unknown as object,
        defaultValues: {} as object,
        isLocked: true,
        marketplaceKey: 'shopify',
      },
    })
    await expect(
      testDb.csvMappingTemplate.create({
        data: {
          tenantId: tenant.id,
          name: 'Stock import',
          direction: 'import',
          resourceType: 'stock',
          delimiter: ',',
          encoding: 'utf-8',
          hasHeaderRow: true,
          columnMappings: [] as unknown as object,
          defaultValues: {} as object,
          isLocked: false,
          marketplaceKey: 'shopify',
        },
      }),
    ).resolves.toBeTruthy()
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

  it('serializes a concurrent delete + install on the same marketplace key (Codex review fix F2)', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const headers = authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' })
      const seed = (
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/marketplace/shopify/install',
          headers,
          payload: { name: 'Seed' },
        })
      ).json() as InstallBody

      // Fire delete + install in parallel against the same (tenant, key).
      // Either request can land first; the SERIALIZABLE+retry pipeline must
      // resolve to a consistent end state — either:
      //   - both succeed (delete first, install creates a new sibling)
      //   - both succeed (install first, delete removes the original)
      // Failure mode pre-fix: the new install could end up with no locked
      // templates because the delete (with stale sibling count) tore them
      // down while the install was running.
      const [delRes, installRes] = await Promise.all([
        app.inject({
          method: 'DELETE',
          url: `/v1/integrations/${seed.data.integration.id}`,
          headers,
        }),
        app.inject({
          method: 'POST',
          url: '/v1/integrations/marketplace/shopify/install',
          headers,
          payload: { name: 'Race' },
        }),
      ])
      // Either both 2xx or one side returned 503 SERIALIZATION_FAILED after
      // exhausting retries — both are acceptable outcomes for this contract.
      // What must NOT happen: a 500 or a torn end state.
      expect([204, 503]).toContain(delRes.statusCode)
      expect([201, 503]).toContain(installRes.statusCode)

      const surviving = await testDb.integration.findMany({
        where: { tenantId: tenant.id, deletedAt: null, marketplaceKey: 'shopify' },
        select: { id: true, name: true },
      })
      // Whatever the ordering, the surviving rows are the ones whose
      // operations succeeded. Use the response codes to drive the assertion.
      const expectedNames = new Set<string>()
      if (delRes.statusCode !== 204) expectedNames.add('Seed')
      if (installRes.statusCode === 201) expectedNames.add('Race')
      expect(new Set(surviving.map((r) => r.name))).toEqual(expectedNames)
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
