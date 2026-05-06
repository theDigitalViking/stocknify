import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listFtpDirectory,
  streamFtpFile,
  testFtpConnection,
} from '../../../integrations/ftp-client.js'
import {
  listSftpDirectory,
  streamSftpFile,
  testSftpConnection,
  type SftpFileInfo,
  type SftpStreamHandle,
} from '../../../integrations/sftp-client.js'
import { encryptCredential } from '../../../lib/encryption.js'
import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

// Replace the SFTP/FTP wrappers with vi.fn so tests never open a network
// socket. The credential routes' own test file mocks these too — vitest
// keeps mocks scoped per-file via the implicit __vi_import_meta__ machinery.
vi.mock('../../../integrations/sftp-client.js', () => ({
  testSftpConnection: vi.fn(),
  listSftpDirectory: vi.fn(),
  streamSftpFile: vi.fn(),
}))
vi.mock('../../../integrations/ftp-client.js', () => ({
  testFtpConnection: vi.fn(),
  listFtpDirectory: vi.fn(),
  streamFtpFile: vi.fn(),
}))

const mockedListSftp = vi.mocked(listSftpDirectory)
const mockedStreamSftp = vi.mocked(streamSftpFile)
const mockedListFtp = vi.mocked(listFtpDirectory)
const mockedStreamFtp = vi.mocked(streamFtpFile)
// Connection tests aren't exercised here but the credential vault preamble
// imports them transitively — the explicit reset keeps state clean.
vi.mocked(testSftpConnection).mockResolvedValue({ success: true })
vi.mocked(testFtpConnection).mockResolvedValue({ success: true })

beforeEach(() => {
  mockedListSftp.mockReset()
  mockedStreamSftp.mockReset()
  mockedListFtp.mockReset()
  mockedStreamFtp.mockReset()
})

interface ImportRunBody {
  data: {
    id: string
    integrationId: string
    credentialId: string | null
    trigger: string
    status: string
    fileName: string | null
    fileSizeBytes: number | null
    rowsTotal: number
    rowsCreated: number
    rowsUpdated: number
    rowsSkipped: number
    rowsErrored: number
    errorSummary: string | null
    completedAt: string | null
  }
}

interface RunsListBody {
  data: ImportRunBody['data'][]
  meta: { total: number; page: number; perPage: number }
}

interface FilesListBody {
  data: SftpFileInfo[]
}

interface ErrorBody {
  error: { code: string; message: string }
}

// Build a minimal stock-import scenario: one tenant, one variant for SKU
// matching, one location, one credential of the given type, one
// integration. Returns the IDs the tests need to construct URLs.
interface SeedResult {
  tenant: { id: string; name: string; slug: string }
  user: { id: string; email: string; role: string }
  integration: { id: string }
  credential: { id: string }
  variant: { id: string; sku: string }
  headers: { authorization: string }
}

async function seedScenario(
  opts: {
    credentialType?: 'sftp' | 'ftp' | 'ftps'
    remotePath?: string
  } = {},
): Promise<SeedResult> {
  const credentialType = opts.credentialType ?? 'sftp'
  const { tenant, user } = await createTestTenant(testDb)
  const integration = await testDb.integration.create({
    data: {
      tenantId: tenant.id,
      type: credentialType,
      name: 'Hive SFTP',
      status: 'active',
    },
  })
  const credential = await testDb.integrationCredential.create({
    data: {
      tenantId: tenant.id,
      integrationId: integration.id,
      credentialType,
      name: 'Hive Production',
      host: 'sftp.hive.example.com',
      port: credentialType === 'sftp' ? 22 : 21,
      username: 'sebastian',
      password: encryptCredential('supersecret'),
      remotePath: opts.remotePath ?? '/exports',
    },
  })
  const product = await testDb.product.create({
    data: { tenantId: tenant.id, name: 'Widget', unit: 'piece' },
  })
  const variant = await testDb.productVariant.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      sku: 'WIDGET-001',
      barcode: '4006381333931',
    },
  })
  await testDb.location.create({
    data: { tenantId: tenant.id, name: 'Main Warehouse', type: 'own_warehouse', address: {} },
  })
  return {
    tenant,
    user,
    integration,
    credential,
    variant,
    headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
  }
}

function makeStreamHandle(content: string): SftpStreamHandle {
  return {
    stream: Readable.from(Buffer.from(content, 'utf-8')),
    cleanup: vi.fn().mockResolvedValue(undefined),
  }
}

const STOCK_CSV = [
  'sku,locationName,quantity,stockType',
  'WIDGET-001,Main Warehouse,42,available',
  'WIDGET-001,Main Warehouse,7,reserved',
].join('\n')

// ---------------------------------------------------------------------------

describe('credentials hard-delete (Cycle 3-C R0)', () => {
  // Pinned here too so a future regression that re-introduces soft-delete
  // would fail this suite as well as the credential vault one.
  it('DELETE /v1/credentials/:id removes the row outright (no deletedAt tombstone)', async () => {
    const { tenant, user, credential } = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/credentials/${credential.id}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const dbRow = await testDb.integrationCredential.findUnique({
        where: { id: credential.id },
      })
      expect(dbRow).toBeNull()
    } finally {
      await app.close()
    }
  })
})

describe('GET /v1/integrations/:id/files (Cycle 3-C R4)', () => {
  it('returns CSVs from the remote directory and excludes non-CSV files', async () => {
    const { tenant, user, integration, credential } = await seedScenario()
    const app = await buildTestApp()
    try {
      // The route asks the SFTP wrapper to filter by extension, so our mock
      // honours that — it's also what the production wrapper does.
      mockedListSftp.mockImplementation(async (_config, _path, filter) => {
        const all: SftpFileInfo[] = [
          { name: 'stock-2026-05-01.csv', size: 12345, modifiedAt: '2026-05-01T08:00:00.000Z', type: 'file' },
          { name: 'stock-2026-05-02.csv', size: 12500, modifiedAt: '2026-05-02T08:00:00.000Z', type: 'file' },
          { name: 'README.txt', size: 200, modifiedAt: '2026-05-02T07:00:00.000Z', type: 'file' },
        ]
        const ext = filter?.extension?.toLowerCase()
        return ext ? all.filter((f) => f.name.toLowerCase().endsWith(ext)) : all
      })

      const res = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${integration.id}/files?credentialId=${credential.id}&path=/exports`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as FilesListBody
      expect(body.data.map((f) => f.name)).toEqual([
        'stock-2026-05-01.csv',
        'stock-2026-05-02.csv',
      ])
      // The wrapper was invoked with the explicit path and the .csv filter.
      expect(mockedListSftp).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'sftp.hive.example.com', port: 22 }),
        '/exports',
        { extension: '.csv' },
      )
    } finally {
      await app.close()
    }
  })

  it('rejects viewer role with 403 (admin-only)', async () => {
    const { tenant, user, integration, credential } = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${integration.id}/files?credentialId=${credential.id}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'viewer' }),
      })
      expect(res.statusCode).toBe(403)
      expect((res.json() as ErrorBody).error.code).toBe('FORBIDDEN')
    } finally {
      await app.close()
    }
  })
})

// ---------------------------------------------------------------------------
// Codex review fixes — 2026-05-08
// ---------------------------------------------------------------------------

describe('credential/integration binding + operational state (Codex review fix)', () => {
  it('rejects with 409 CREDENTIAL_INTEGRATION_MISMATCH when the credential belongs to a different integration', async () => {
    const { tenant, credential, headers } = await seedScenario()
    // A second integration in the same tenant, with no credentials of its
    // own. seedScenario's credential is bound to its own integration, so
    // using it against `otherIntegration.id` must be rejected.
    const otherIntegration = await testDb.integration.create({
      data: {
        tenantId: tenant.id,
        type: 'sftp',
        name: 'Second SFTP',
        status: 'active',
      },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${otherIntegration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id, filePath: '/exports/x.csv' },
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe('CREDENTIAL_INTEGRATION_MISMATCH')
      // Connector was never invoked.
      expect(mockedStreamSftp).not.toHaveBeenCalled()
      // No ImportRun shell was created either — the gate fires before the
      // run row is inserted.
      const runs = await testDb.importRun.count({
        where: { integrationId: otherIntegration.id },
      })
      expect(runs).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('reusable tenant-level credentials (integrationId=null) are accepted on any integration of the same tenant', async () => {
    const { tenant, integration, headers } = await seedScenario()
    // A standalone credential not bound to any integration (the
    // DECISIONS 2026-05-07 reusability use case).
    const reusable = await testDb.integrationCredential.create({
      data: {
        tenantId: tenant.id,
        // integrationId is left undefined → column NULL
        credentialType: 'sftp',
        name: 'Reusable',
        host: 'sftp.example.com',
        port: 22,
        username: 'sebastian',
        password: encryptCredential('supersecret'),
        remotePath: '/exports',
      },
    })
    const app = await buildTestApp()
    try {
      mockedStreamSftp.mockResolvedValue(makeStreamHandle(STOCK_CSV))
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: reusable.id, filePath: '/exports/x.csv' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as ImportRunBody
      expect(body.data.status).toBe('success')
    } finally {
      await app.close()
    }
  })

  it('rejects with 409 INTEGRATION_DISABLED when integration.isEnabled is false', async () => {
    const { integration, credential, headers } = await seedScenario()
    await testDb.integration.update({
      where: { id: integration.id },
      data: { isEnabled: false },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id, filePath: '/exports/x.csv' },
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe('INTEGRATION_DISABLED')
      expect(mockedStreamSftp).not.toHaveBeenCalled()
      // The same gate fires on the listing route too.
      const list = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${integration.id}/files?credentialId=${credential.id}`,
        headers,
      })
      expect(list.statusCode).toBe(409)
      expect((list.json() as ErrorBody).error.code).toBe('INTEGRATION_DISABLED')
      // And no run row was created.
      const runs = await testDb.importRun.count({
        where: { integrationId: integration.id },
      })
      expect(runs).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('rejects with 409 CREDENTIAL_INACTIVE when credential.isActive is false', async () => {
    const { integration, credential, headers } = await seedScenario()
    await testDb.integrationCredential.update({
      where: { id: credential.id },
      data: { isActive: false },
    })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id, filePath: '/exports/x.csv' },
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe('CREDENTIAL_INACTIVE')
      expect(mockedStreamSftp).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})

describe('POST /v1/integrations/:id/import-now (Cycle 3-C R5)', () => {
  it('streams a remote CSV through the pipeline, creates an ImportRun, and tags movements with source=sftp', async () => {
    const { tenant, integration, credential, variant, headers } = await seedScenario()
    const app = await buildTestApp()
    try {
      mockedStreamSftp.mockResolvedValue(makeStreamHandle(STOCK_CSV))

      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id, filePath: '/exports/stock-2026-05-02.csv' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as ImportRunBody
      expect(body.data.status).toBe('success')
      expect(body.data.trigger).toBe('manual')
      expect(body.data.fileName).toBe('stock-2026-05-02.csv')
      expect(body.data.rowsTotal).toBe(2)
      expect(body.data.rowsCreated + body.data.rowsUpdated).toBe(2)
      expect(body.data.rowsErrored).toBe(0)
      expect(body.data.completedAt).not.toBeNull()

      // The connector was called with the decrypted password, not the
      // ciphertext that lives on disk.
      expect(mockedStreamSftp).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'sftp.hive.example.com', password: 'supersecret' }),
        '/exports/stock-2026-05-02.csv',
      )

      // stock_movements rows carry source='sftp', not 'csv'/'sync' — this is
      // the granular-source distinction operators see in the movement view.
      const movements = await testDb.stockMovement.findMany({
        where: { tenantId: tenant.id, variantId: variant.id },
      })
      expect(movements.length).toBe(2)
      for (const m of movements) {
        expect(m.source).toBe('sftp')
      }

      // The ImportRun row reflects the same outcome.
      const importRun = await testDb.importRun.findUniqueOrThrow({
        where: { id: body.data.id },
      })
      expect(importRun.tenantId).toBe(tenant.id)
      expect(importRun.integrationId).toBe(integration.id)
      expect(importRun.status).toBe('success')
    } finally {
      await app.close()
    }
  })

  it('FTP credentials produce source=ftp and route through the FTP wrapper', async () => {
    const { tenant, integration, credential, variant, headers } = await seedScenario({
      credentialType: 'ftp',
    })
    const app = await buildTestApp()
    try {
      mockedStreamFtp.mockResolvedValue(makeStreamHandle(STOCK_CSV))

      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id, filePath: '/exports/x.csv' },
      })
      expect(res.statusCode).toBe(200)
      expect((res.json() as ImportRunBody).data.status).toBe('success')

      expect(mockedStreamFtp).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'sftp.hive.example.com', port: 21, secure: false }),
        '/exports/x.csv',
      )
      expect(mockedStreamSftp).not.toHaveBeenCalled()

      const movements = await testDb.stockMovement.findMany({
        where: { tenantId: tenant.id, variantId: variant.id },
      })
      for (const m of movements) {
        expect(m.source).toBe('ftp')
      }
    } finally {
      await app.close()
    }
  })

  it('marks the ImportRun as failed when the connector throws', async () => {
    const { integration, credential, headers } = await seedScenario()
    const app = await buildTestApp()
    try {
      mockedStreamSftp.mockRejectedValue(new Error('Connection refused'))

      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id, filePath: '/exports/x.csv' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as ImportRunBody
      expect(body.data.status).toBe('failed')
      expect(body.data.errorSummary).toContain('Connection refused')
      expect(body.data.completedAt).not.toBeNull()
    } finally {
      await app.close()
    }
  })

  it('with no filePath, lists the directory and picks the newest CSV', async () => {
    const { integration, credential, headers } = await seedScenario({ remotePath: '/inbox' })
    const app = await buildTestApp()
    try {
      mockedListSftp.mockResolvedValue([
        { name: 'stock-newest.csv', size: 100, modifiedAt: '2026-05-03T00:00:00.000Z', type: 'file' },
        { name: 'stock-old.csv', size: 90, modifiedAt: '2026-05-01T00:00:00.000Z', type: 'file' },
      ])
      mockedStreamSftp.mockResolvedValue(makeStreamHandle(STOCK_CSV))

      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${integration.id}/import-now`,
        headers,
        payload: { credentialId: credential.id },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as ImportRunBody
      expect(body.data.fileName).toBe('stock-newest.csv')
      // The connector was called with the joined path on the credential's
      // configured remotePath.
      expect(mockedStreamSftp).toHaveBeenCalledWith(
        expect.anything(),
        '/inbox/stock-newest.csv',
      )
    } finally {
      await app.close()
    }
  })
})

describe('GET /v1/integrations/:id/runs (Cycle 3-C R6)', () => {
  it('returns paginated runs newest-first with correct total in meta', async () => {
    const { tenant, integration, headers } = await seedScenario()
    // Three runs at distinct startedAt timestamps so the ordering is
    // deterministic regardless of insert order.
    for (let i = 0; i < 3; i++) {
      await testDb.importRun.create({
        data: {
          tenantId: tenant.id,
          integrationId: integration.id,
          trigger: 'manual',
          status: i === 0 ? 'success' : i === 1 ? 'partial' : 'failed',
          fileName: `stock-${String(i)}.csv`,
          rowsTotal: 10,
          rowsCreated: 5,
          rowsUpdated: 3,
          rowsSkipped: 1,
          rowsErrored: 1,
          startedAt: new Date(2026, 4, i + 1),
        },
      })
    }
    const app = await buildTestApp()
    try {
      const page1 = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${integration.id}/runs?page=1&perPage=2`,
        headers,
      })
      expect(page1.statusCode).toBe(200)
      const body1 = page1.json() as RunsListBody
      expect(body1.meta).toEqual({ total: 3, page: 1, perPage: 2 })
      expect(body1.data).toHaveLength(2)
      // Newest first: index 2 (stock-2.csv) leads, then 1.
      expect(body1.data.map((r) => r.fileName)).toEqual(['stock-2.csv', 'stock-1.csv'])

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${integration.id}/runs?page=2&perPage=2`,
        headers,
      })
      const body2 = page2.json() as RunsListBody
      expect(body2.data).toHaveLength(1)
      expect(body2.data[0]?.fileName).toBe('stock-0.csv')
    } finally {
      await app.close()
    }
  })

  it('cross-tenant isolation: tenant B cannot see tenant A integration runs', async () => {
    const a = await seedScenario()
    const b = await seedScenario()
    await testDb.importRun.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        trigger: 'manual',
        status: 'success',
      },
    })
    const app = await buildTestApp()
    try {
      // Tenant B asking for tenant A's integration → 404
      // (RLS / tenant scope hides A's integration row entirely).
      const res = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${a.integration.id}/runs`,
        headers: authedHeaders({
          tenantId: b.tenant.id,
          userId: b.user.id,
          role: 'admin',
        }),
      })
      expect(res.statusCode).toBe(404)
      expect((res.json() as ErrorBody).error.code).toBe('INTEGRATION_NOT_FOUND')

      // And tenant B's own integration has zero runs.
      const own = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${b.integration.id}/runs`,
        headers: authedHeaders({
          tenantId: b.tenant.id,
          userId: b.user.id,
          role: 'admin',
        }),
      })
      expect(own.statusCode).toBe(200)
      expect((own.json() as RunsListBody).data).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})
