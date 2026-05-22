/**
 * Cycle 5-E — credential browse endpoint tests.
 *
 * Covers the new GET /v1/credentials/:id/browse route used by the wizard
 * and edit-page directory browsers. Mocks the SFTP/FTP listing primitives
 * so no real socket is opened.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listFtpDirectory, testFtpConnection } from '../../../integrations/ftp-client.js'
import {
  listSftpDirectory,
  testSftpConnection,
  type SftpFileInfo,
} from '../../../integrations/sftp-client.js'
import { encryptCredential } from '../../../lib/encryption.js'
import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

vi.mock('../../../integrations/sftp-client.js', () => ({
  testSftpConnection: vi.fn(),
  listSftpDirectory: vi.fn(),
}))
vi.mock('../../../integrations/ftp-client.js', () => ({
  testFtpConnection: vi.fn(),
  listFtpDirectory: vi.fn(),
}))

const mockedListSftp = vi.mocked(listSftpDirectory)
const mockedListFtp = vi.mocked(listFtpDirectory)
vi.mocked(testSftpConnection).mockResolvedValue({ success: true })
vi.mocked(testFtpConnection).mockResolvedValue({ success: true })

beforeEach(() => {
  mockedListSftp.mockReset()
  mockedListFtp.mockReset()
})

interface BrowseBody {
  data: SftpFileInfo[]
}

interface ErrorBody {
  error: { code: string; message: string }
}

async function seedSftpCredential(
  opts: { credentialType?: 'sftp' | 'ftp' | 'ftps' | 'api_key'; isActive?: boolean } = {},
): Promise<{
  tenant: { id: string }
  user: { id: string }
  credential: { id: string }
}> {
  const credentialType = opts.credentialType ?? 'sftp'
  const { tenant, user } = await createTestTenant(testDb)
  const credential = await testDb.integrationCredential.create({
    data: {
      tenantId: tenant.id,
      credentialType,
      name: `${credentialType} credentials`,
      host: 'sftp.example.com',
      port: credentialType === 'sftp' ? 22 : 21,
      username: 'sebastian',
      password: encryptCredential('supersecret'),
      remotePath: '/exports',
      isActive: opts.isActive ?? true,
    },
  })
  return { tenant, user, credential }
}

describe('GET /v1/credentials/:id/browse (Cycle 5-E)', () => {
  it('returns the unfiltered directory listing (files + folders) for an SFTP credential', async () => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      const entries: SftpFileInfo[] = [
        { name: 'archive', size: 0, modifiedAt: '2026-05-20T00:00:00.000Z', type: 'directory' },
        { name: 'stock-2026-05-22.csv', size: 1024, modifiedAt: '2026-05-22T06:00:00.000Z', type: 'file' },
        { name: 'notes.txt', size: 42, modifiedAt: '2026-05-22T06:00:00.000Z', type: 'file' },
      ]
      mockedListSftp.mockResolvedValue(entries)

      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as BrowseBody
      expect(body.data).toHaveLength(3)
      // Critically, no extension filter was applied — the route returns
      // everything the connector yields so the operator can navigate freely.
      expect(body.data.map((e) => e.name)).toContain('notes.txt')
      // Falls back to credential.remotePath when no query is sent.
      expect(mockedListSftp).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'sftp.example.com', password: 'supersecret' }),
        '/exports',
      )
    } finally {
      await app.close()
    }
  })

  it('honours the ?path query parameter', async () => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      mockedListSftp.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=${encodeURIComponent('/exports/daily')}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      expect(mockedListSftp).toHaveBeenCalledWith(
        expect.anything(),
        '/exports/daily',
      )
    } finally {
      await app.close()
    }
  })

  it('returns 409 CREDENTIAL_INACTIVE when the credential is deactivated', async () => {
    const { tenant, user, credential } = await seedSftpCredential({ isActive: false })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(409)
      const body = res.json() as ErrorBody
      expect(body.error.code).toBe('CREDENTIAL_INACTIVE')
      expect(mockedListSftp).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('returns 404 (no existence enumeration) when the credential belongs to another tenant', async () => {
    // Seed credential in tenant A.
    const { credential } = await seedSftpCredential()
    // Build a second tenant to issue the request from.
    const { tenant: otherTenant, user: otherUser } = await createTestTenant(testDb)
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({
          tenantId: otherTenant.id,
          userId: otherUser.id,
          role: 'admin',
        }),
      })
      expect(res.statusCode).toBe(404)
      const body = res.json() as ErrorBody
      expect(body.error.code).toBe('CREDENTIAL_NOT_FOUND')
    } finally {
      await app.close()
    }
  })

  it('rejects viewer role with 403 FORBIDDEN', async () => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'viewer' }),
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await app.close()
    }
  })

  it('rejects credentials whose type is not browsable (api_key) with 400', async () => {
    const { tenant, user, credential } = await seedSftpCredential({ credentialType: 'api_key' })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json() as ErrorBody
      expect(body.error.code).toBe('CREDENTIAL_TYPE_NOT_SUPPORTED')
    } finally {
      await app.close()
    }
  })

  it('routes FTP/FTPS credentials through the FTP wrapper with secure flag', async () => {
    const { tenant, user, credential } = await seedSftpCredential({ credentialType: 'ftps' })
    const app = await buildTestApp()
    try {
      mockedListFtp.mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      expect(mockedListFtp).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true, port: 21 }),
        '/exports',
      )
      expect(mockedListSftp).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('returns 502 CONNECTION_FAILED when the listing throws', async () => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      mockedListSftp.mockRejectedValue(new Error('Connection refused'))

      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(502)
      const body = res.json() as ErrorBody
      expect(body.error.code).toBe('CONNECTION_FAILED')
    } finally {
      await app.close()
    }
  })
})

// ---------------------------------------------------------------------------
// Cycle 5-E Codex review fix F2 — browse containment.
//
// The endpoint previously forwarded any `?path=` straight to the listing
// primitive. With this fix, paths outside `credential.remotePath` and
// traversal attempts are rejected with 400 before any socket is opened.
// ---------------------------------------------------------------------------
describe('GET /v1/credentials/:id/browse — containment (Cycle 5-E review fix F2)', () => {
  it.each([
    ['/etc', 'absolute path outside the credential base'],
    ['/etc/passwd', 'unrelated absolute file'],
    ['/exportsfoo', 'sibling that prefix-matches but is not under base'],
  ])('rejects out-of-base path %j with BROWSE_PATH_OUT_OF_BASE', async (path) => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=${encodeURIComponent(path)}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json() as ErrorBody
      expect(body.error.code).toBe('BROWSE_PATH_OUT_OF_BASE')
      // No socket opened on the rejection path.
      expect(mockedListSftp).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it.each([
    '/exports/../etc',
    '/exports/daily/../../etc',
    '/exports/sub/../../..',
  ])('rejects traversal path %j with BROWSE_PATH_OUT_OF_BASE', async (path) => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=${encodeURIComponent(path)}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json() as ErrorBody
      // Either OUT_OF_BASE (canonicalized outside) or INVALID (root escape).
      expect(['BROWSE_PATH_OUT_OF_BASE', 'BROWSE_PATH_INVALID']).toContain(
        body.error.code,
      )
      expect(mockedListSftp).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('rejects relative paths (must be absolute)', async () => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=exports`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as ErrorBody).error.code).toBe('BROWSE_PATH_INVALID')
    } finally {
      await app.close()
    }
  })

  it.each([
    '/exports',
    '/exports/daily',
    '/exports/daily/2026-05',
    '/exports/./daily',           // canonicalizes to /exports/daily
    '/exports/daily/../weekly',    // canonicalizes to /exports/weekly
  ])('accepts %j (inside or equal to credential.remotePath)', async (path) => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      mockedListSftp.mockResolvedValue([])
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=${encodeURIComponent(path)}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('credential.remotePath="/" opts in to wide-open browsing', async () => {
    const { tenant, user } = await createTestTenant(testDb)
    const credential = await testDb.integrationCredential.create({
      data: {
        tenantId: tenant.id,
        credentialType: 'sftp',
        name: 'Root credential',
        host: 'sftp.example.com',
        port: 22,
        username: 'sebastian',
        password: encryptCredential('s'),
        remotePath: '/',
        isActive: true,
      },
    })
    const app = await buildTestApp()
    try {
      mockedListSftp.mockResolvedValue([])
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=${encodeURIComponent('/etc')}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      // With base=/, the operator has explicitly opted in to broader
      // browsing — same posture as any admin with SSH access.
      expect(res.statusCode).toBe(200)
      expect(mockedListSftp).toHaveBeenCalledWith(expect.anything(), '/etc')
    } finally {
      await app.close()
    }
  })

  it('returns meta.path and meta.base alongside data', async () => {
    const { tenant, user, credential } = await seedSftpCredential()
    const app = await buildTestApp()
    try {
      mockedListSftp.mockResolvedValue([])
      const res = await app.inject({
        method: 'GET',
        url: `/v1/credentials/${credential.id}/browse?path=${encodeURIComponent('/exports/daily')}`,
        headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as BrowseBody & {
        meta: { path: string; base: string }
      }
      expect(body.meta.path).toBe('/exports/daily')
      expect(body.meta.base).toBe('/exports')
    } finally {
      await app.close()
    }
  })
})
