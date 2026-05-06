import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testFtpConnection } from '../../../integrations/ftp-client.js'
import { testSftpConnection } from '../../../integrations/sftp-client.js'
import { decryptCredential, MASKED_SECRET } from '../../../lib/encryption.js'
import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

// Replace the SFTP/FTP connector wrappers with vi.fn so tests never open a
// network socket. vi.mock is hoisted by vitest above the imports, so the
// route file picks up the mocked exports when it imports the same paths.
vi.mock('../../../integrations/sftp-client.js', () => ({
  testSftpConnection: vi.fn(),
}))
vi.mock('../../../integrations/ftp-client.js', () => ({
  testFtpConnection: vi.fn(),
}))

const mockedSftp = vi.mocked(testSftpConnection)
const mockedFtp = vi.mocked(testFtpConnection)

beforeEach(() => {
  mockedSftp.mockReset()
  mockedFtp.mockReset()
  // Default: connection succeeds. Individual tests override.
  mockedSftp.mockResolvedValue({ success: true })
  mockedFtp.mockResolvedValue({ success: true })
})

interface CredentialBody {
  id: string
  integrationId: string | null
  credentialType: string
  name: string
  host: string | null
  port: number | null
  username: string | null
  password: string | null
  token: string | null
  secret: string | null
  remotePath: string | null
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ListBody {
  data: Array<CredentialBody & { usageCount: number }>
}

interface SingleBody {
  data: CredentialBody
}

interface ErrorBody {
  error: { code: string; message: string }
}

interface DeleteBody {
  data: { id: string; deleted: boolean }
}

interface TestBody {
  data: { success: boolean; error?: string }
}

describe('credentials routes (Cycle 3-B)', () => {
  it('CRUD happy path: create → list → patch → delete (with masking, decrypt-on-roundtrip)', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      // Create
      const created = await app.inject({
        method: 'POST',
        url: '/v1/credentials',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: {
          name: 'Test SFTP',
          credentialType: 'sftp',
          host: 'sftp.example.com',
          username: 'sebastian',
          password: 'supersecret',
        },
      })
      expect(created.statusCode).toBe(201)
      const createdBody = created.json() as SingleBody
      expect(createdBody.data.name).toBe('Test SFTP')
      expect(createdBody.data.credentialType).toBe('sftp')
      // Default port for sftp
      expect(createdBody.data.port).toBe(22)
      // Password is masked in the response — never plaintext, never ciphertext.
      expect(createdBody.data.password).toBe(MASKED_SECRET)

      const credentialId = createdBody.data.id

      // The DB row carries an encrypted blob, not the plaintext.
      const dbRow = await testDb.integrationCredential.findUniqueOrThrow({
        where: { id: credentialId },
      })
      const encryptedPassword = dbRow.password
      if (encryptedPassword === null) throw new Error('expected encrypted password')
      expect(encryptedPassword).not.toBe('supersecret')
      // The encrypted payload format is `iv:tag:ciphertext` (3 hex segments).
      expect(encryptedPassword.split(':')).toHaveLength(3)
      // Round-trip: encrypted blob decrypts back to plaintext.
      expect(decryptCredential(encryptedPassword)).toBe('supersecret')

      // List
      const list = await app.inject({
        method: 'GET',
        url: '/v1/credentials',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(list.statusCode).toBe(200)
      const listBody = list.json() as ListBody
      expect(listBody.data).toHaveLength(1)
      expect(listBody.data[0]?.id).toBe(credentialId)
      expect(listBody.data[0]?.password).toBe(MASKED_SECRET)
      expect(listBody.data[0]?.usageCount).toBe(0)

      // Patch — change name + clear password (null) + set token (string).
      const patched = await app.inject({
        method: 'PATCH',
        url: `/v1/credentials/${credentialId}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: {
          name: 'Renamed SFTP',
          password: null,
          token: 'api-token-123',
        },
      })
      expect(patched.statusCode).toBe(200)
      const patchedBody = patched.json() as SingleBody
      expect(patchedBody.data.name).toBe('Renamed SFTP')
      expect(patchedBody.data.password).toBeNull()
      expect(patchedBody.data.token).toBe(MASKED_SECRET)

      const dbAfterPatch = await testDb.integrationCredential.findUniqueOrThrow({
        where: { id: credentialId },
      })
      expect(dbAfterPatch.password).toBeNull()
      const encryptedToken = dbAfterPatch.token
      if (encryptedToken === null) throw new Error('expected encrypted token')
      expect(decryptCredential(encryptedToken)).toBe('api-token-123')

      // Delete (no schedules → succeeds)
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/v1/credentials/${credentialId}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(deleted.statusCode).toBe(200)
      const deletedBody = deleted.json() as DeleteBody
      expect(deletedBody.data).toEqual({ id: credentialId, deleted: true })

      // List now empty (soft-delete excludes the row).
      const listAfter = await app.inject({
        method: 'GET',
        url: '/v1/credentials',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect((listAfter.json() as ListBody).data).toHaveLength(0)

      // Re-fetching by id 404s.
      const refetch = await app.inject({
        method: 'PATCH',
        url: `/v1/credentials/${credentialId}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: { name: 'should not exist' },
      })
      expect(refetch.statusCode).toBe(404)
      expect((refetch.json() as ErrorBody).error.code).toBe('CREDENTIAL_NOT_FOUND')
    } finally {
      await app.close()
    }
  })

  it('rejects DELETE when an active schedule references the credential (CREDENTIAL_IN_USE)', async () => {
    const { tenant, user } = await createTestTenant(testDb)

    // The credential needs an integration to attach the schedule to (the
    // schedule.integrationId is still required even though the credential's
    // is now nullable).
    const integration = await testDb.integration.create({
      data: {
        tenantId: tenant.id,
        type: 'sftp',
        name: 'Hive SFTP',
        status: 'active',
      },
    })

    const app = await buildTestApp()
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/credentials',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: {
          name: 'In-Use SFTP',
          credentialType: 'sftp',
          host: 'sftp.example.com',
          username: 'sebastian',
          password: 'pw',
          integrationId: integration.id,
        },
      })
      expect(created.statusCode).toBe(201)
      const credentialId = (created.json() as SingleBody).data.id

      // Active schedule referencing the credential.
      await testDb.integrationSchedule.create({
        data: {
          tenantId: tenant.id,
          integrationId: integration.id,
          name: 'Daily import',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '06:00',
          weekdays: [],
          cronExpression: '0 6 * * *',
          credentialId,
        },
      })

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/credentials/${credentialId}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe('CREDENTIAL_IN_USE')
    } finally {
      await app.close()
    }
  })

  it('cross-tenant isolation: tenant B cannot read, update, delete, or test tenant A credentials', async () => {
    const tenantA = await createTestTenant(testDb)
    const tenantB = await createTestTenant(testDb)

    const app = await buildTestApp()
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/credentials',
        headers: authedHeaders({
          tenantId: tenantA.tenant.id,
          userId: tenantA.user.id,
          role: 'admin',
        }),
        payload: {
          name: 'Tenant-A Credential',
          credentialType: 'sftp',
          host: 'sftp.a.example.com',
          username: 'a',
          password: 'apw',
        },
      })
      expect(created.statusCode).toBe(201)
      const credentialId = (created.json() as SingleBody).data.id

      const headersB = authedHeaders({
        tenantId: tenantB.tenant.id,
        userId: tenantB.user.id,
        role: 'admin',
      })

      // List as tenant B — does not see A's credential.
      const list = await app.inject({ method: 'GET', url: '/v1/credentials', headers: headersB })
      expect(list.statusCode).toBe(200)
      expect((list.json() as ListBody).data).toHaveLength(0)

      // PATCH/DELETE/test as tenant B — all 404 (no existence enumeration).
      const patch = await app.inject({
        method: 'PATCH',
        url: `/v1/credentials/${credentialId}`,
        headers: headersB,
        payload: { name: 'pwned' },
      })
      expect(patch.statusCode).toBe(404)

      const del = await app.inject({
        method: 'DELETE',
        url: `/v1/credentials/${credentialId}`,
        headers: headersB,
      })
      expect(del.statusCode).toBe(404)

      const test = await app.inject({
        method: 'POST',
        url: `/v1/credentials/${credentialId}/test`,
        headers: headersB,
      })
      expect(test.statusCode).toBe(404)

      // Tenant A's credential is still there + intact.
      const dbRow = await testDb.integrationCredential.findUnique({ where: { id: credentialId } })
      expect(dbRow?.deletedAt).toBeNull()
      expect(dbRow?.name).toBe('Tenant-A Credential')
    } finally {
      await app.close()
    }
  })

  it('connection test (saved credential): mocked SFTP success → updates lastVerifiedAt and returns success', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/credentials',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: {
          name: 'Test SFTP',
          credentialType: 'sftp',
          host: 'sftp.example.com',
          username: 'sebastian',
          password: 'supersecret',
        },
      })
      const credentialId = (created.json() as SingleBody).data.id

      mockedSftp.mockResolvedValueOnce({ success: true })

      const res = await app.inject({
        method: 'POST',
        url: `/v1/credentials/${credentialId}/test`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      expect((res.json() as TestBody).data).toEqual({ success: true })

      // The SFTP wrapper was called with the DECRYPTED password — the route
      // is responsible for decrypting before handing it to the connector.
      expect(mockedSftp).toHaveBeenCalledWith({
        host: 'sftp.example.com',
        port: 22,
        username: 'sebastian',
        password: 'supersecret',
      })

      // lastVerifiedAt is bumped on success.
      const dbRow = await testDb.integrationCredential.findUniqueOrThrow({
        where: { id: credentialId },
      })
      expect(dbRow.lastVerifiedAt).not.toBeNull()
    } finally {
      await app.close()
    }
  })

  it('connection test (saved credential): mocked SFTP failure → returns error and does not update lastVerifiedAt', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/credentials',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: {
          name: 'Test SFTP',
          credentialType: 'sftp',
          host: 'sftp.example.com',
          username: 'sebastian',
          password: 'supersecret',
        },
      })
      const credentialId = (created.json() as SingleBody).data.id

      mockedSftp.mockResolvedValueOnce({
        success: false,
        error: 'All configured authentication methods failed',
      })

      const res = await app.inject({
        method: 'POST',
        url: `/v1/credentials/${credentialId}/test`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as TestBody
      expect(body.data.success).toBe(false)
      expect(body.data.error).toBe('All configured authentication methods failed')

      const dbRow = await testDb.integrationCredential.findUniqueOrThrow({
        where: { id: credentialId },
      })
      expect(dbRow.lastVerifiedAt).toBeNull()
    } finally {
      await app.close()
    }
  })

  it('connection test (unsaved): POST /credentials/test does not touch the DB', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      mockedFtp.mockResolvedValueOnce({ success: true })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/credentials/test',
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
        payload: {
          name: 'Unsaved FTPS',
          credentialType: 'ftps',
          host: 'ftps.example.com',
          username: 'temp',
          password: 'temp-pw',
        },
      })
      expect(res.statusCode).toBe(200)
      expect((res.json() as TestBody).data).toEqual({ success: true })

      // FTPS routes through the FTP wrapper with secure=true.
      expect(mockedFtp).toHaveBeenCalledWith({
        host: 'ftps.example.com',
        port: 21,
        username: 'temp',
        password: 'temp-pw',
        secure: true,
      })
      expect(mockedSftp).not.toHaveBeenCalled()

      // No row was persisted.
      const count = await testDb.integrationCredential.count({
        where: { tenantId: tenant.id },
      })
      expect(count).toBe(0)
    } finally {
      await app.close()
    }
  })
})
