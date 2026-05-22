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
