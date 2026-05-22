/**
 * Cycle 5-C — `applyPostImportAction` decision-tree tests.
 *
 * The connector primitives are mocked at the module boundary
 * (`sftp-client.js` / `ftp-client.js`) so we never touch the network. The
 * counter-query path uses the real test DB to pin the SQL contract (filter
 * on tenant, integration, fileName, status, createdAt > lastSuccessfulSyncAt).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../integrations/sftp-client.js', () => ({
  testSftpConnection: vi.fn(),
  listSftpDirectory: vi.fn(),
  streamSftpFile: vi.fn(),
  ensureSftpDirectory: vi.fn().mockResolvedValue(undefined),
  moveSftpFile: vi.fn().mockResolvedValue(undefined),
  deleteSftpFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../integrations/ftp-client.js', () => ({
  testFtpConnection: vi.fn(),
  listFtpDirectory: vi.fn(),
  streamFtpFile: vi.fn(),
  ensureFtpDirectory: vi.fn().mockResolvedValue(undefined),
  moveFtpFile: vi.fn().mockResolvedValue(undefined),
  deleteFtpFile: vi.fn().mockResolvedValue(undefined),
}))

import {
  deleteSftpFile,
  ensureSftpDirectory,
  moveSftpFile,
} from '../../../integrations/sftp-client.js'
import { createTestTenant, testDb } from '../../../test/db.js'
import { applyPostImportAction } from '../post-import-action.js'

const mockedEnsure = vi.mocked(ensureSftpDirectory)
const mockedMove = vi.mocked(moveSftpFile)
const mockedDelete = vi.mocked(deleteSftpFile)

const silentLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

interface SeedOpts {
  postImportAction?: string
  archiveSubdir?: string
  maxImportRetries?: number
  failedAction?: string
  failedSubdir?: string
  lastSuccessfulSyncAt?: Date | null
}

async function seed(opts: SeedOpts = {}): Promise<{
  tenantId: string
  integrationId: string
  integrationRow: {
    id: string
    tenantId: string
    postImportAction: string
    archiveSubdir: string
    maxImportRetries: number
    failedAction: string
    failedSubdir: string
    lastSuccessfulSyncAt: Date | null
  }
}> {
  const { tenant } = await createTestTenant(testDb)
  const integration = await testDb.integration.create({
    data: {
      tenantId: tenant.id,
      type: 'sftp',
      name: 'Test SFTP',
      status: 'active',
      postImportAction: opts.postImportAction ?? 'archive',
      archiveSubdir: opts.archiveSubdir ?? 'archive',
      maxImportRetries: opts.maxImportRetries ?? 3,
      failedAction: opts.failedAction ?? 'archive',
      failedSubdir: opts.failedSubdir ?? 'failed',
      lastSuccessfulSyncAt: opts.lastSuccessfulSyncAt ?? null,
    },
  })
  return {
    tenantId: tenant.id,
    integrationId: integration.id,
    integrationRow: {
      id: integration.id,
      tenantId: tenant.id,
      postImportAction: integration.postImportAction,
      archiveSubdir: integration.archiveSubdir,
      maxImportRetries: integration.maxImportRetries,
      failedAction: integration.failedAction,
      failedSubdir: integration.failedSubdir,
      lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
    },
  }
}

async function seedImportRun(
  tenantId: string,
  integrationId: string,
  fileName: string,
  status: string,
  createdAt?: Date,
  wasFinalAttempt = true,
): Promise<{ id: string }> {
  const data: {
    tenantId: string
    integrationId: string
    fileName: string
    status: string
    trigger: string
    rowsTotal: number
    wasFinalAttempt: boolean
    createdAt?: Date
  } = {
    tenantId,
    integrationId,
    fileName,
    status,
    trigger: 'scheduled',
    rowsTotal: 0,
    wasFinalAttempt,
  }
  if (createdAt) data.createdAt = createdAt
  return testDb.importRun.create({ data, select: { id: true } })
}

const cfg = { host: 'h', port: 22, username: 'u', password: 'p' }

beforeEach(() => {
  silentLog.info.mockClear()
  silentLog.warn.mockClear()
  silentLog.error.mockClear()
})

afterEach(() => {
  mockedEnsure.mockClear()
  mockedMove.mockClear()
  mockedDelete.mockClear()
})

describe('applyPostImportAction — success branch (Cycle 5-C)', () => {
  it('success + archive: ensures and moves to <dir>/<subdir>/<YYYY-MM>/<file>', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      postImportAction: 'archive',
      archiveSubdir: 'archive',
    })
    const run = await seedImportRun(tenantId, integrationId, 'data.csv', 'success')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/data.csv',
      importRunStatus: 'success',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    expect(mockedEnsure).toHaveBeenCalledTimes(1)
    const ensureArg = mockedEnsure.mock.calls[0]?.[1] ?? ''
    expect(ensureArg).toMatch(/^\/exports\/archive\/\d{4}-\d{2}$/)
    expect(mockedMove).toHaveBeenCalledTimes(1)
    const moveSource = mockedMove.mock.calls[0]?.[1]
    const moveDest = mockedMove.mock.calls[0]?.[2] ?? ''
    expect(moveSource).toBe('/exports/data.csv')
    expect(moveDest).toMatch(/^\/exports\/archive\/\d{4}-\d{2}\/data\.csv$/)
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('success + delete: calls delete, no archive helpers', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      postImportAction: 'delete',
    })
    const run = await seedImportRun(tenantId, integrationId, 'data.csv', 'success')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/data.csv',
      importRunStatus: 'success',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    expect(mockedDelete).toHaveBeenCalledWith(expect.anything(), '/exports/data.csv')
    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedMove).not.toHaveBeenCalled()
  })

  it('partial + archive: treats partial like success — archives the file', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      postImportAction: 'archive',
    })
    const run = await seedImportRun(tenantId, integrationId, 'data.csv', 'partial')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/data.csv',
      importRunStatus: 'partial',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    expect(mockedEnsure).toHaveBeenCalledTimes(1)
    expect(mockedMove).toHaveBeenCalledTimes(1)
  })
})

describe('applyPostImportAction — manual failed (Cycle 5-C)', () => {
  it('manual + failed + archive: archives immediately, no counter lookup', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      failedAction: 'archive',
      failedSubdir: 'failed',
      maxImportRetries: 3,
    })
    const run = await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'manual',
    })

    expect(mockedEnsure).toHaveBeenCalledTimes(1)
    const ensureArg = mockedEnsure.mock.calls[0]?.[1] ?? ''
    expect(ensureArg).toMatch(/^\/exports\/failed\/\d{4}-\d{2}$/)
    expect(mockedMove).toHaveBeenCalledTimes(1)
  })

  it('manual + failed + delete: deletes immediately', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      failedAction: 'delete',
    })
    const run = await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'manual',
    })

    expect(mockedDelete).toHaveBeenCalledWith(expect.anything(), '/exports/bad.csv')
  })
})

describe('applyPostImportAction — scheduled failed counter (Cycle 5-C)', () => {
  it('counter < maxRetries+1: keeps file, no cleanup', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      maxImportRetries: 3,
    })
    const run = await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    // 1 failed run vs. maxRetries=3 → 1 is NOT > 3, no cleanup.
    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('counter exactly = maxRetries+1: triggers cleanup', async () => {
    // Threshold = maxImportRetries (3). Cleanup fires when count EXCEEDS 3
    // → seed 4 failed runs, the just-finalised one + 3 prior.
    const { tenantId, integrationId, integrationRow } = await seed({
      maxImportRetries: 3,
      failedAction: 'archive',
    })
    await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')
    await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')
    await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')
    const run = await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    expect(mockedEnsure).toHaveBeenCalledTimes(1)
    expect(mockedMove).toHaveBeenCalledTimes(1)
  })

  it('counter at threshold exactly (= maxRetries): NO cleanup (> not ≥)', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      maxImportRetries: 3,
    })
    // Seed 3 failed runs total — exactly at threshold, must NOT cleanup.
    await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')
    await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')
    const run = await seedImportRun(tenantId, integrationId, 'bad.csv', 'failed')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedMove).not.toHaveBeenCalled()
  })

  it('BullMQ retry-burst: 3 non-final + 1 final attempts in one tick count as ONE failure (Codex review fix)', async () => {
    // Simulates one cron tick with 3 BullMQ attempts (attempts: 3 in the
    // queue config). Without `wasFinalAttempt` gating, the counter would
    // see 4 rows for this single tick and trip a maxImportRetries=3
    // threshold immediately. With the gate it sees 1, so the cleanup
    // waits for additional cron ticks as the operator configured.
    const { tenantId, integrationId, integrationRow } = await seed({
      maxImportRetries: 3,
    })
    // 3 retry-burst attempts (non-final) — should NOT count.
    await seedImportRun(
      tenantId,
      integrationId,
      'bad.csv',
      'failed',
      undefined,
      false,
    )
    await seedImportRun(
      tenantId,
      integrationId,
      'bad.csv',
      'failed',
      undefined,
      false,
    )
    // The final attempt of this tick (also counted as ONE in the gate
    // semantics; it's the just-finalised row for `applyPostImportAction`).
    const run = await seedImportRun(
      tenantId,
      integrationId,
      'bad.csv',
      'failed',
      undefined,
      true,
    )

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    // Effective counter = 1 (only the final-attempt row). Well below
    // maxRetries+1=4 → no cleanup, source file stays.
    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('counter resets after a success: prior failures pre-success are excluded', async () => {
    const successTime = new Date(Date.now() - 60_000)
    const { tenantId, integrationId, integrationRow } = await seed({
      maxImportRetries: 3,
      lastSuccessfulSyncAt: successTime,
    })
    // Pre-success failures should NOT count.
    await seedImportRun(
      tenantId,
      integrationId,
      'bad.csv',
      'failed',
      new Date(successTime.getTime() - 120_000),
    )
    await seedImportRun(
      tenantId,
      integrationId,
      'bad.csv',
      'failed',
      new Date(successTime.getTime() - 90_000),
    )
    // Post-success failure: the just-finalised one.
    const run = await seedImportRun(
      tenantId,
      integrationId,
      'bad.csv',
      'failed',
      new Date(successTime.getTime() + 30_000),
    )

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: integrationRow,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/bad.csv',
      importRunStatus: 'failed',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    // Effective counter = 1 (only the post-success run), well below
    // maxRetries+1=4 → no cleanup, keeps the file.
    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedMove).not.toHaveBeenCalled()
  })
})

describe('applyPostImportAction — error handling (Cycle 5-C)', () => {
  it('cleanup-helper throws: errorSummary appended, no exception bubbles up', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      postImportAction: 'archive',
    })
    const run = await testDb.importRun.create({
      data: {
        tenantId,
        integrationId,
        fileName: 'data.csv',
        status: 'success',
        trigger: 'scheduled',
        errorSummary: '2 row(s) failed; first: missing variant',
      },
    })

    mockedEnsure.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(
      applyPostImportAction({
        db: testDb,
        log: silentLog,
        integration: integrationRow,
        credentialType: 'sftp',
        remoteConfig: cfg,
        sourceFilePath: '/exports/data.csv',
        importRunStatus: 'success',
        importRunId: run.id,
        trigger: 'scheduled',
      }),
    ).resolves.toBeUndefined()

    const after = await testDb.importRun.findUnique({ where: { id: run.id } })
    expect(after?.errorSummary).toContain('2 row(s) failed')
    expect(after?.errorSummary).toContain('Connection refused')
  })

  it('unknown action: warns and skips, no helper called', async () => {
    const { tenantId, integrationId, integrationRow } = await seed({
      postImportAction: 'archive',
    })
    // Override the in-memory shape with an unknown action.
    const tampered = { ...integrationRow, postImportAction: 'foo' }
    const run = await seedImportRun(tenantId, integrationId, 'data.csv', 'success')

    await applyPostImportAction({
      db: testDb,
      log: silentLog,
      integration: tampered,
      credentialType: 'sftp',
      remoteConfig: cfg,
      sourceFilePath: '/exports/data.csv',
      importRunStatus: 'success',
      importRunId: run.id,
      trigger: 'scheduled',
    })

    expect(mockedEnsure).not.toHaveBeenCalled()
    expect(mockedMove).not.toHaveBeenCalled()
    expect(mockedDelete).not.toHaveBeenCalled()
    expect(silentLog.warn).toHaveBeenCalled()
  })
})
