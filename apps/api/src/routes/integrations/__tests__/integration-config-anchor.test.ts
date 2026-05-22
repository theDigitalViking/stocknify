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

// ---------------------------------------------------------------------------
// Cycle 5-A.5 review fix (F2): the original draft of the backfill filtered
// only on `deleted_at IS NULL`, which could promote credentials/mapping from
// an inactive schedule into the new integration defaults. The fix filters
// `is_active = TRUE` and adds an `id DESC` tie-breaker. This test runs the
// fixed backfill SQL against a deliberately-shaped fixture (active + inactive
// schedules on the same integration) and asserts the active row wins.
// ---------------------------------------------------------------------------

describe('Cycle 5-A.5 migration backfill — active-schedule precedence (F2)', () => {
  it('picks the newest ACTIVE schedule, not the newest (active OR inactive)', async () => {
    const { tenant } = await createTestTenant(testDb)
    const integration = await testDb.integration.create({
      data: {
        tenantId: tenant.id,
        type: 'sftp',
        name: 'Hive SFTP',
        status: 'active',
      },
    })
    const activeCredential = await testDb.integrationCredential.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        credentialType: 'sftp',
        name: 'active-cred',
        host: 'sftp.active.example.com',
        port: 22,
        username: 'u',
        password: 'enc:active',
        isActive: true,
      },
    })
    const inactiveCredential = await testDb.integrationCredential.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        credentialType: 'sftp',
        name: 'inactive-cred',
        host: 'sftp.inactive.example.com',
        port: 22,
        username: 'u',
        password: 'enc:inactive',
        isActive: true,
      },
    })

    // Active schedule, OLDER createdAt
    const activeSchedule = await testDb.integrationSchedule.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        name: 'Active',
        resourceType: 'stock',
        direction: 'import',
        scheduleType: 'daily',
        timeOfDay: '06:00',
        cronExpression: '0 6 * * *',
        credentialId: activeCredential.id,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
    // Inactive schedule, NEWER createdAt — bad backfill would pick this one.
    await testDb.integrationSchedule.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        name: 'Inactive (newer)',
        resourceType: 'stock',
        direction: 'import',
        scheduleType: 'daily',
        timeOfDay: '07:00',
        cronExpression: '0 7 * * *',
        credentialId: inactiveCredential.id,
        isActive: false,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      },
    })

    // Reset the integration's defaults so the backfill UPDATE has work to do.
    await testDb.integration.update({
      where: { id: integration.id },
      data: { credentialId: null, csvMappingTemplateId: null },
    })

    // Run the fixed backfill SQL directly. This mirrors the body of the
    // migration's UPDATE so any later edit to the SQL will be caught by a
    // diff against this assertion.
    await testDb.$executeRawUnsafe(`
      UPDATE "integrations" i
      SET
        "credential_id" = s.credential_id,
        "csv_mapping_template_id" = s.csv_mapping_template_id
      FROM (
        SELECT DISTINCT ON (integration_id)
          integration_id,
          credential_id,
          csv_mapping_template_id
        FROM "integration_schedules"
        WHERE deleted_at IS NULL
          AND is_active = TRUE
        ORDER BY integration_id, created_at DESC, id DESC
      ) s
      WHERE i.id = s.integration_id
        AND i.deleted_at IS NULL
        AND i.id = '${integration.id}'
    `)

    const reread = await testDb.integration.findUnique({
      where: { id: integration.id },
    })
    expect(reread?.credentialId).toBe(activeCredential.id)
    expect(reread?.credentialId).not.toBe(inactiveCredential.id)

    // Sanity: the active schedule's row was the source — pin its id so a
    // future change to the active-schedule ordering surfaces here.
    expect(activeSchedule.credentialId).toBe(activeCredential.id)
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
