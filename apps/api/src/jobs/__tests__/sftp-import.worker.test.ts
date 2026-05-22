/**
 * Cycle 3-D Codex review fix — non-final BullMQ retry attempts must NOT
 * create an Incident or bump consecutiveFailures. Without this gate, a
 * single transient connection failure produced 3 Incident rows and
 * snapped consecutiveFailures from 0 to 3 in a single cron tick, instantly
 * flipping healthStatus to 'failing'.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testFtpConnection } from '../../integrations/ftp-client.js'
import {
  listSftpDirectory,
  streamSftpFile,
  testSftpConnection,
} from '../../integrations/sftp-client.js'
import { encryptCredential } from '../../lib/encryption.js'
import { applyPostImportAction } from '../../services/integrations/post-import-action.js'
import { createTestTenant, testDb } from '../../test/db.js'
import { processSftpImportJob } from '../sftp-import.worker.js'

vi.mock('../../integrations/sftp-client.js', () => ({
  testSftpConnection: vi.fn(),
  listSftpDirectory: vi.fn(),
  streamSftpFile: vi.fn(),
  ensureSftpDirectory: vi.fn(),
  moveSftpFile: vi.fn(),
  deleteSftpFile: vi.fn(),
}))
vi.mock('../../integrations/ftp-client.js', () => ({
  testFtpConnection: vi.fn(),
  listFtpDirectory: vi.fn(),
  streamFtpFile: vi.fn(),
  ensureFtpDirectory: vi.fn(),
  moveFtpFile: vi.fn(),
  deleteFtpFile: vi.fn(),
}))
vi.mock('../../services/integrations/post-import-action.js', () => ({
  applyPostImportAction: vi.fn().mockResolvedValue(undefined),
}))

// Connection-test imports are pulled transitively by other modules; the
// explicit reset keeps state clean across test files.
vi.mocked(testSftpConnection).mockResolvedValue({ success: true })
vi.mocked(testFtpConnection).mockResolvedValue({ success: true })

const mockedList = vi.mocked(listSftpDirectory)
const mockedStream = vi.mocked(streamSftpFile)
const mockedApplyPostImport = vi.mocked(applyPostImportAction)

beforeEach(() => {
  mockedList.mockReset()
  mockedStream.mockReset()
  mockedApplyPostImport.mockReset()
  mockedApplyPostImport.mockResolvedValue(undefined)
})

interface SeedResult {
  tenant: { id: string }
  integration: { id: string }
  schedule: { id: string }
}

async function seedSchedule(): Promise<SeedResult> {
  const { tenant } = await createTestTenant(testDb)
  const integration = await testDb.integration.create({
    data: {
      tenantId: tenant.id,
      type: 'sftp',
      name: 'Hive SFTP',
      status: 'active',
      consecutiveFailures: 0,
      healthStatus: 'unknown',
    },
  })
  const credential = await testDb.integrationCredential.create({
    data: {
      tenantId: tenant.id,
      integrationId: integration.id,
      credentialType: 'sftp',
      name: 'Hive Production',
      host: 'sftp.hive.example.com',
      port: 22,
      username: 'sebastian',
      password: encryptCredential('supersecret'),
      remotePath: '/exports',
      isActive: true,
    },
  })
  const schedule = await testDb.integrationSchedule.create({
    data: {
      tenantId: tenant.id,
      integrationId: integration.id,
      name: 'Daily',
      resourceType: 'stock',
      direction: 'import',
      scheduleType: 'daily',
      timeOfDay: '06:00',
      cronExpression: '0 6 * * *',
      credentialId: credential.id,
      isActive: true,
    },
  })
  return { tenant, integration, schedule }
}

describe('processSftpImportJob — final-attempt gating (Codex review fix)', () => {
  it('does NOT create an Incident or bump consecutiveFailures on a non-final BullMQ retry attempt', async () => {
    const { tenant, integration, schedule } = await seedSchedule()
    // Connector throws — simulate a transient connection failure.
    mockedList.mockRejectedValue(new Error('Connection refused'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: false },
      ),
    ).rejects.toThrow('Connection refused')

    // No incident row created.
    const incidents = await testDb.incident.findMany({
      where: { tenantId: tenant.id, integrationId: integration.id },
    })
    expect(incidents).toHaveLength(0)
    // consecutiveFailures stays at 0.
    const integrationAfter = await testDb.integration.findUnique({
      where: { id: integration.id },
    })
    expect(integrationAfter?.consecutiveFailures).toBe(0)
    // healthStatus is NOT escalated to 'failing' on a non-final attempt.
    expect(integrationAfter?.healthStatus).toBe('unknown')
    // But lastError IS recorded so observability still has the trail.
    expect(integrationAfter?.lastError).toContain('Connection refused')
    expect(integrationAfter?.lastErrorAt).not.toBeNull()
    // ImportRun row is finalized as failed (audit trail of every attempt).
    const runs = await testDb.importRun.findMany({
      where: { scheduleId: schedule.id },
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]?.status).toBe('failed')
    // Schedule.lastRun* is also updated on every attempt.
    const schAfter = await testDb.integrationSchedule.findUnique({
      where: { id: schedule.id },
    })
    expect(schAfter?.lastRunStatus).toBe('failed')
  })

  it('DOES create an Incident and bump consecutiveFailures on the final retry attempt', async () => {
    const { tenant, integration, schedule } = await seedSchedule()
    mockedList.mockRejectedValue(new Error('Connection refused'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: true },
      ),
    ).rejects.toThrow('Connection refused')

    const incidents = await testDb.incident.findMany({
      where: { tenantId: tenant.id, integrationId: integration.id },
    })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]?.code).toBe('SFTP_IMPORT_FAILED')
    expect(incidents[0]?.severity).toBe('error')
    expect(incidents[0]?.isUserVisible).toBe(true)

    const integrationAfter = await testDb.integration.findUnique({
      where: { id: integration.id },
    })
    expect(integrationAfter?.consecutiveFailures).toBe(1)
    expect(integrationAfter?.healthStatus).toBe('degraded')
  })

  it('produces exactly ONE incident across a 3-attempt retry cycle', async () => {
    const { tenant, integration, schedule } = await seedSchedule()
    mockedList.mockRejectedValue(new Error('Connection refused'))

    // Three retry attempts — only the last one is final per BullMQ
    // semantics (attempts: 3 → final when attemptsMade + 1 >= 3).
    await expect(
      processSftpImportJob({ scheduleId: schedule.id }, { isFinalAttempt: false }),
    ).rejects.toThrow()
    await expect(
      processSftpImportJob({ scheduleId: schedule.id }, { isFinalAttempt: false }),
    ).rejects.toThrow()
    await expect(
      processSftpImportJob({ scheduleId: schedule.id }, { isFinalAttempt: true }),
    ).rejects.toThrow()

    const incidents = await testDb.incident.findMany({
      where: { tenantId: tenant.id, integrationId: integration.id },
    })
    expect(incidents).toHaveLength(1)
    // consecutiveFailures bumped exactly once for this cron tick.
    const integrationAfter = await testDb.integration.findUnique({
      where: { id: integration.id },
    })
    expect(integrationAfter?.consecutiveFailures).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Cycle 5-A.5 — Worker resolves credential from Integration when Schedule has none
// ---------------------------------------------------------------------------

describe('processSftpImportJob — Integration default credential fallback (Cycle 5-A.5)', () => {
  it('resolves credential from Integration when Schedule.credentialId is null', async () => {
    const { tenant } = await createTestTenant(testDb)
    const integration = await testDb.integration.create({
      data: {
        tenantId: tenant.id,
        type: 'sftp',
        name: 'Hive SFTP',
        status: 'active',
        consecutiveFailures: 0,
        healthStatus: 'unknown',
      },
    })
    const credential = await testDb.integrationCredential.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        credentialType: 'sftp',
        name: 'Hive Production',
        host: 'sftp.hive.example.com',
        port: 22,
        username: 'sebastian',
        password: encryptCredential('supersecret'),
        remotePath: '/exports',
        isActive: true,
      },
    })
    // Wire the credential as Integration default; schedule has NO credentialId.
    await testDb.integration.update({
      where: { id: integration.id },
      data: { credentialId: credential.id },
    })
    const schedule = await testDb.integrationSchedule.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        name: 'Daily',
        resourceType: 'stock',
        direction: 'import',
        scheduleType: 'daily',
        timeOfDay: '06:00',
        cronExpression: '0 6 * * *',
        credentialId: null,
        isActive: true,
      },
    })

    // Connector throws — we only care that the worker REACHED the connector
    // path (which means credential resolution succeeded via the Integration
    // fallback).
    mockedList.mockRejectedValue(new Error('Connection refused'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: false },
      ),
    ).rejects.toThrow('Connection refused')

    // The ImportRun row was created — confirms the worker advanced past the
    // credential resolution and into the connector call (a skipped run
    // would not write an ImportRun).
    const runs = await testDb.importRun.findMany({
      where: { scheduleId: schedule.id },
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]?.credentialId).toBe(credential.id)
  })

  it('skips with credential_inactive when both Schedule and Integration have no credential', async () => {
    const { tenant } = await createTestTenant(testDb)
    const integration = await testDb.integration.create({
      data: {
        tenantId: tenant.id,
        type: 'sftp',
        name: 'Hive SFTP',
        status: 'active',
        consecutiveFailures: 0,
        healthStatus: 'unknown',
      },
    })
    const schedule = await testDb.integrationSchedule.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        name: 'Daily',
        resourceType: 'stock',
        direction: 'import',
        scheduleType: 'daily',
        timeOfDay: '06:00',
        cronExpression: '0 6 * * *',
        credentialId: null,
        isActive: true,
      },
    })

    const result = await processSftpImportJob(
      { scheduleId: schedule.id },
      { isFinalAttempt: true },
    )
    expect(result.status).toBe('skipped')
    expect(result.reason).toBe('credential_inactive')
    // No ImportRun row created on the credential-missing skip path.
    const runs = await testDb.importRun.findMany({
      where: { scheduleId: schedule.id },
    })
    expect(runs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Cycle 5-C — post-import cleanup gating
// ---------------------------------------------------------------------------

describe('processSftpImportJob — post-import cleanup wiring (Cycle 5-C)', () => {
  it('catch path on isFinalAttempt: true with filePath resolved calls applyPostImportAction', async () => {
    const { schedule } = await seedSchedule()
    mockedList.mockResolvedValueOnce([
      {
        name: 'data.csv',
        size: 100,
        modifiedAt: new Date().toISOString(),
        type: 'file',
      },
    ])
    mockedStream.mockRejectedValueOnce(new Error('Stream broke'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: true },
      ),
    ).rejects.toThrow('Stream broke')

    expect(mockedApplyPostImport).toHaveBeenCalledTimes(1)
    const args = mockedApplyPostImport.mock.calls[0]?.[0]
    expect(args?.trigger).toBe('scheduled')
    expect(args?.importRunStatus).toBe('failed')
    expect(args?.sourceFilePath).toBe('/exports/data.csv')
  })

  it('catch path on isFinalAttempt: false does NOT call applyPostImportAction', async () => {
    const { schedule } = await seedSchedule()
    mockedList.mockResolvedValueOnce([
      {
        name: 'data.csv',
        size: 100,
        modifiedAt: new Date().toISOString(),
        type: 'file',
      },
    ])
    mockedStream.mockRejectedValueOnce(new Error('Stream broke'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: false },
      ),
    ).rejects.toThrow('Stream broke')

    expect(mockedApplyPostImport).not.toHaveBeenCalled()
  })

  it('non-final BullMQ retry writes ImportRun with wasFinalAttempt=false (Codex review fix)', async () => {
    const { schedule } = await seedSchedule()
    mockedList.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: false },
      ),
    ).rejects.toThrow()

    const runs = await testDb.importRun.findMany({
      where: { scheduleId: schedule.id },
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]?.wasFinalAttempt).toBe(false)
  })

  it('final BullMQ retry writes ImportRun with wasFinalAttempt=true', async () => {
    const { schedule } = await seedSchedule()
    mockedList.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: true },
      ),
    ).rejects.toThrow()

    const runs = await testDb.importRun.findMany({
      where: { scheduleId: schedule.id },
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]?.wasFinalAttempt).toBe(true)
  })

  it('catch path with filePath unresolved (listing threw) does NOT call applyPostImportAction', async () => {
    const { schedule } = await seedSchedule()
    // Listing throws BEFORE filePath resolves.
    mockedList.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(
      processSftpImportJob(
        { scheduleId: schedule.id },
        { isFinalAttempt: true },
      ),
    ).rejects.toThrow('Connection refused')

    expect(mockedApplyPostImport).not.toHaveBeenCalled()
  })
})
