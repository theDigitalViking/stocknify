/**
 * Cycle 5-A.5 — Integration as Konfig-Anker.
 *
 * Tests the PATCH /v1/integrations/:id surface for the new `credentialId`
 * and `csvMappingTemplateId` fields plus the narrowed SFTP rename gate.
 */

import { describe, expect, it } from 'vitest'

import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

interface PatchBody {
  data: {
    id: string
    name: string
    credentialId: string | null
    csvMappingTemplateId: string | null
  }
}

interface ErrorBody {
  error: { code: string; message: string }
}

async function seedSftpIntegration(): Promise<{
  tenantId: string
  userId: string
  integrationId: string
  headers: { authorization: string }
}> {
  const { tenant, user } = await createTestTenant(testDb)
  const integration = await testDb.integration.create({
    data: {
      tenantId: tenant.id,
      type: 'sftp',
      name: 'SFTP Import',
      status: 'active',
      marketplaceKey: 'sftp',
    },
  })
  return {
    tenantId: tenant.id,
    userId: user.id,
    integrationId: integration.id,
    headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
  }
}

describe('PATCH /v1/integrations/:id — Cycle 5-A.5 name rename narrowing', () => {
  it('allows PATCH name on an SFTP marketplace integration', async () => {
    const seed = await seedSftpIntegration()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integrationId}`,
        headers: seed.headers,
        payload: { name: 'Hive nightly drop' },
      })
      expect(res.statusCode).toBe(200)
      expect((res.json() as PatchBody).data.name).toBe('Hive nightly drop')

      const row = await testDb.integration.findUnique({
        where: { id: seed.integrationId },
      })
      expect(row?.name).toBe('Hive nightly drop')
    } finally {
      await app.close()
    }
  })

  it('rejects PATCH name on a non-SFTP marketplace integration (Shopify)', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const integration = await testDb.integration.create({
      data: {
        tenantId: tenant.id,
        type: 'shopify',
        name: 'Shopify Test',
        status: 'active',
        marketplaceKey: 'shopify',
      },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${integration.id}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'Shopify Production' },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR')

      // Name unchanged in the DB.
      const row = await testDb.integration.findUnique({ where: { id: integration.id } })
      expect(row?.name).toBe('Shopify Test')
    } finally {
      await app.close()
    }
  })
})

describe('PATCH /v1/integrations/:id — Cycle 5-A.5 credentialId field', () => {
  it('sets credentialId with a valid SFTP credential and persists it', async () => {
    const seed = await seedSftpIntegration()
    const credential = await testDb.integrationCredential.create({
      data: {
        tenantId: seed.tenantId,
        integrationId: seed.integrationId,
        credentialType: 'sftp',
        name: 'Hive Production',
        host: 'sftp.hive.example.com',
        port: 22,
        username: 'sebastian',
        password: 'enc-blob:irrelevant',
        isActive: true,
      },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integrationId}`,
        headers: seed.headers,
        payload: { credentialId: credential.id },
      })
      expect(res.statusCode).toBe(200)

      const row = await testDb.integration.findUnique({
        where: { id: seed.integrationId },
      })
      expect(row?.credentialId).toBe(credential.id)
    } finally {
      await app.close()
    }
  })

  it('rejects an inactive credential with 400 INVALID_CREDENTIAL', async () => {
    const seed = await seedSftpIntegration()
    const credential = await testDb.integrationCredential.create({
      data: {
        tenantId: seed.tenantId,
        integrationId: seed.integrationId,
        credentialType: 'sftp',
        name: 'Inactive',
        host: 'sftp.example.com',
        port: 22,
        username: 'x',
        password: 'enc:x',
        isActive: false,
      },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integrationId}`,
        headers: seed.headers,
        payload: { credentialId: credential.id },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as ErrorBody).error.code).toBe('INVALID_CREDENTIAL')
    } finally {
      await app.close()
    }
  })

  it('clears credentialId when sent null', async () => {
    const seed = await seedSftpIntegration()
    const credential = await testDb.integrationCredential.create({
      data: {
        tenantId: seed.tenantId,
        integrationId: seed.integrationId,
        credentialType: 'sftp',
        name: 'Hive',
        host: 'sftp.example.com',
        port: 22,
        username: 'x',
        password: 'enc:x',
        isActive: true,
      },
    })
    await testDb.integration.update({
      where: { id: seed.integrationId },
      data: { credentialId: credential.id },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integrationId}`,
        headers: seed.headers,
        payload: { credentialId: null },
      })
      expect(res.statusCode).toBe(200)
      const row = await testDb.integration.findUnique({
        where: { id: seed.integrationId },
      })
      expect(row?.credentialId).toBeNull()
    } finally {
      await app.close()
    }
  })
})

describe('PATCH /v1/integrations/:id — Cycle 5-A.5 csvMappingTemplateId field', () => {
  it('rejects an export-direction template with 400 INVALID_MAPPING_TEMPLATE', async () => {
    const seed = await seedSftpIntegration()
    const template = await testDb.csvMappingTemplate.create({
      data: {
        tenantId: seed.tenantId,
        name: 'Stock Export',
        direction: 'export',
        resourceType: 'stock',
        columnMappings: [],
      },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integrationId}`,
        headers: seed.headers,
        payload: { csvMappingTemplateId: template.id },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as ErrorBody).error.code).toBe('INVALID_MAPPING_TEMPLATE')
    } finally {
      await app.close()
    }
  })

  it('sets a valid import/stock template', async () => {
    const seed = await seedSftpIntegration()
    const template = await testDb.csvMappingTemplate.create({
      data: {
        tenantId: seed.tenantId,
        name: 'Hive stock import',
        direction: 'import',
        resourceType: 'stock',
        columnMappings: [],
      },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integrationId}`,
        headers: seed.headers,
        payload: { csvMappingTemplateId: template.id },
      })
      expect(res.statusCode).toBe(200)
      const row = await testDb.integration.findUnique({
        where: { id: seed.integrationId },
      })
      expect(row?.csvMappingTemplateId).toBe(template.id)
    } finally {
      await app.close()
    }
  })
})
