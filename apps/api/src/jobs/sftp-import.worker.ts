/**
 * Cycle 3-D — SFTP/FTP scheduled import worker.
 *
 * Drains the `sftp-import` queue: for each fired job (one per cron tick of
 * a registered schedule), loads the schedule + integration + credential,
 * streams the latest remote CSV through the shared stock-import pipeline,
 * and writes an `ImportRun` row reflecting the outcome.
 *
 * The worker runs outside of a Fastify request, so there is no tenant
 * middleware applying `set_config('app.current_tenant_id', ...)`. RLS
 * bypass on the application path is intentional (Prisma connects as the
 * table owner — same posture as test suites); every query the worker makes
 * scopes by `tenantId` explicitly.
 *
 * Failure semantics:
 *   - Connector / network errors → BullMQ retries via the queue's
 *     defaultJobOptions (3 attempts, exp backoff). Each retry creates a
 *     fresh ImportRun if the previous attempt finalized as failed; the
 *     schedule's per-cron firing waits for retries to exhaust.
 *   - Row-level import errors → ImportRun.status = 'partial'. Does NOT
 *     retry (would re-import partially-successful rows).
 *   - Persistent failures (3 retries) → an Incident row is created so the
 *     operator is no longer blind.
 */

import { Buffer } from 'node:buffer'

import { PrismaClient } from '@prisma/client'

import {
  listFtpDirectory,
  streamFtpFile,
  type FtpTestConfig,
} from '../integrations/ftp-client.js'
import {
  listSftpDirectory,
  streamSftpFile,
  type SftpFileInfo,
  type SftpStreamHandle,
  type SftpTestConfig,
} from '../integrations/sftp-client.js'
import { decryptCredential } from '../lib/encryption.js'
import { prisma as defaultPrisma } from '../middleware/tenant.js'
import {
  buildStockExtractor,
  decodeBuffer,
  parseCsvStreamingBuffer,
  processStockImportRows,
  type ColumnMapping,
} from '../services/stock-import/process-csv-stock.js'

const REMOTE_CSV_MAX_BYTES = 5 * 1024 * 1024
const CSV_MAX_ROWS = 10_000

const TESTABLE_TYPES = ['sftp', 'ftp', 'ftps'] as const
type TestableType = (typeof TESTABLE_TYPES)[number]

function isTestableType(value: string): value is TestableType {
  return (TESTABLE_TYPES as readonly string[]).includes(value)
}

function sourceForCredentialType(type: TestableType): 'sftp' | 'ftp' {
  return type === 'sftp' ? 'sftp' : 'ftp'
}

function joinRemotePath(dir: string, file: string): string {
  if (!dir || dir === '/') return file.startsWith('/') ? file : `/${file}`
  if (file.startsWith('/')) return file
  return dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`
}

async function bufferRemoteStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(
          Object.assign(new Error('REMOTE_FILE_TOO_LARGE'), {
            code: 'REMOTE_FILE_TOO_LARGE',
          }),
        )
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(Buffer.concat(chunks, total))
    })
  })
}

function buildSftpConfig(c: {
  host: string
  port: number
  username: string
  password?: string | undefined
}): SftpTestConfig {
  return {
    host: c.host,
    port: c.port,
    username: c.username,
    ...(c.password !== undefined ? { password: c.password } : {}),
  }
}

function buildFtpConfig(
  c: { host: string; port: number; username: string; password?: string | undefined },
  secure: boolean,
): FtpTestConfig {
  return {
    host: c.host,
    port: c.port,
    username: c.username,
    ...(c.password !== undefined ? { password: c.password } : {}),
    secure,
  }
}

interface RemoteCredentialConfig {
  host: string
  port: number
  username: string
  password?: string
}

async function listRemote(
  type: TestableType,
  cfg: RemoteCredentialConfig,
  remotePath: string,
): Promise<SftpFileInfo[]> {
  if (type === 'sftp') {
    return listSftpDirectory(buildSftpConfig(cfg), remotePath, { extension: '.csv' })
  }
  return listFtpDirectory(buildFtpConfig(cfg, type === 'ftps'), remotePath, {
    extension: '.csv',
  })
}

async function streamRemote(
  type: TestableType,
  cfg: RemoteCredentialConfig,
  filePath: string,
): Promise<SftpStreamHandle> {
  if (type === 'sftp') {
    return streamSftpFile(buildSftpConfig(cfg), filePath)
  }
  return streamFtpFile(buildFtpConfig(cfg, type === 'ftps'), filePath)
}

// ---------------------------------------------------------------------------
// Health-status mapping. After a successful import, reset to 'healthy'.
// After a failure, escalate based on accumulated consecutiveFailures: 1–2
// failures → 'degraded'; 3+ → 'failing'. This mirrors the policy in
// PROJECT.md §5.
// ---------------------------------------------------------------------------

function escalateHealth(consecutiveFailures: number): 'degraded' | 'failing' {
  return consecutiveFailures >= 3 ? 'failing' : 'degraded'
}

// ---------------------------------------------------------------------------
// Job entry point
// ---------------------------------------------------------------------------

export interface SftpImportJobData {
  scheduleId: string
}

export interface ProcessJobOptions {
  prisma?: PrismaClient
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
}

const noopLogger = {
  info: (..._a: unknown[]) => undefined,
  warn: (..._a: unknown[]) => undefined,
  error: (..._a: unknown[]) => undefined,
}

export async function processSftpImportJob(
  data: SftpImportJobData,
  opts: ProcessJobOptions = {},
): Promise<{ status: string; importRunId?: string; reason?: string }> {
  const db = opts.prisma ?? defaultPrisma
  const log = opts.logger ?? noopLogger

  const schedule = await db.integrationSchedule.findFirst({
    where: { id: data.scheduleId },
    include: {
      integration: true,
      credential: true,
      csvMappingTemplate: true,
    },
  })
  if (!schedule || schedule.deletedAt !== null) {
    log.warn('schedule not found or soft-deleted', data.scheduleId)
    return { status: 'skipped', reason: 'schedule_missing' }
  }
  if (!schedule.isActive) {
    log.warn('schedule inactive — skipping', data.scheduleId)
    return { status: 'skipped', reason: 'schedule_inactive' }
  }
  const integration = schedule.integration
  if (integration.deletedAt !== null || !integration.isEnabled) {
    log.warn('integration disabled or deleted — skipping', integration.id)
    return { status: 'skipped', reason: 'integration_disabled' }
  }
  const credential = schedule.credential
  if (!credential || credential.deletedAt !== null || !credential.isActive) {
    log.warn('credential missing/inactive — skipping', schedule.credentialId)
    return { status: 'skipped', reason: 'credential_inactive' }
  }
  if (!isTestableType(credential.credentialType)) {
    log.warn('credential type not supported', credential.credentialType)
    return { status: 'skipped', reason: 'credential_type_unsupported' }
  }
  if (credential.host === null || credential.username === null) {
    log.warn('credential incomplete', credential.id)
    return { status: 'skipped', reason: 'credential_incomplete' }
  }

  let plainPassword: string | undefined
  if (credential.password !== null) {
    try {
      plainPassword = decryptCredential(credential.password)
    } catch (err) {
      log.error('decrypt failed', err)
      return { status: 'skipped', reason: 'credential_decrypt_failed' }
    }
  }

  const cfg: RemoteCredentialConfig = {
    host: credential.host,
    port: credential.port ?? (credential.credentialType === 'sftp' ? 22 : 21),
    username: credential.username,
    ...(plainPassword !== undefined ? { password: plainPassword } : {}),
  }

  const importRun = await db.importRun.create({
    data: {
      tenantId: schedule.tenantId,
      integrationId: integration.id,
      scheduleId: schedule.id,
      credentialId: credential.id,
      trigger: 'scheduled',
      status: 'running',
    },
  })

  try {
    const dir = (credential.remotePath ?? '/').trim() || '/'
    const files = await listRemote(credential.credentialType, cfg, dir)
    const newest = files.find((f) => f.type === 'file')
    if (!newest) {
      const failed = await finalizeFailedRun(
        db,
        importRun.id,
        'No CSV files found in remote directory',
      )
      await markScheduleAndHealth(db, schedule.id, integration.id, 'failed', failed.errorSummary)
      return { status: 'failed', importRunId: importRun.id, reason: 'no_files' }
    }
    const filePath = joinRemotePath(dir, newest.name)

    let mappings: ColumnMapping[] | null = null
    let defaults: Record<string, string> = {}
    let delimiter = ','
    let hasHeaderRow = true
    let encoding = 'utf-8'
    if (schedule.csvMappingTemplate) {
      const t = schedule.csvMappingTemplate
      if (t.direction !== 'import' || t.resourceType !== 'stock') {
        const failed = await finalizeFailedRun(
          db,
          importRun.id,
          'Mapping template must have direction=import and resourceType=stock',
        )
        await markScheduleAndHealth(db, schedule.id, integration.id, 'failed', failed.errorSummary)
        return { status: 'failed', importRunId: importRun.id, reason: 'invalid_template' }
      }
      mappings = t.columnMappings as unknown as ColumnMapping[]
      defaults = t.defaultValues as Record<string, string>
      delimiter = t.delimiter
      hasHeaderRow = t.hasHeaderRow
      encoding = t.encoding
    }

    const handle = await streamRemote(credential.credentialType, cfg, filePath)
    let buffer: Buffer
    try {
      buffer = await bufferRemoteStream(handle.stream, REMOTE_CSV_MAX_BYTES)
    } finally {
      await handle.cleanup()
    }
    const decoded = decodeBuffer(buffer, encoding)
    const parsed = await parseCsvStreamingBuffer(
      decoded,
      { delimiter, hasHeaderRow },
      CSV_MAX_ROWS,
      'strict',
    )
    const extractor = buildStockExtractor(mappings, defaults)
    const result = await processStockImportRows(
      {
        db,
        tenantId: schedule.tenantId,
        userId: null,
        source: sourceForCredentialType(credential.credentialType),
        dryRun: false,
        // The worker has no Fastify request; processStockImportRows accepts
        // any FastifyBaseLogger-shaped object — but its row-error path only
        // calls log.error/log.warn. Cast to satisfy the signature.
        log: log as unknown as Parameters<typeof processStockImportRows>[0]['log'],
      },
      parsed,
      extractor,
    )

    const status: 'success' | 'partial' | 'failed' =
      result.errors.length > 0 && result.created + result.updated === 0
        ? 'failed'
        : result.errors.length > 0
          ? 'partial'
          : 'success'
    const fileName = filePath.includes('/') ? filePath.slice(filePath.lastIndexOf('/') + 1) : filePath

    await db.importRun.update({
      where: { id: importRun.id },
      data: {
        status,
        fileName,
        fileSizeBytes: buffer.length,
        rowsTotal: result.totalRows,
        rowsCreated: result.created,
        rowsUpdated: result.updated,
        rowsSkipped: result.skipped,
        rowsErrored: result.errors.length,
        errorSummary:
          result.errors.length > 0
            ? `${String(result.errors.length)} row(s) failed; first: ${result.errors[0]?.reason ?? ''}`
            : null,
        completedAt: new Date(),
      },
    })

    await markScheduleAndHealth(
      db,
      schedule.id,
      integration.id,
      status,
      status === 'success' ? null : `${String(result.errors.length)} row(s) failed`,
    )

    return { status, importRunId: importRun.id }
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code
    const reason =
      code === 'REMOTE_FILE_TOO_LARGE'
        ? 'Remote CSV exceeds the 5 MB size limit'
        : code === 'ROW_LIMIT_EXCEEDED'
          ? `Remote CSV exceeds the maximum of ${String(CSV_MAX_ROWS)} rows`
          : err instanceof Error
            ? `Remote import failed: ${err.message.slice(0, 200)}`
            : 'Remote import failed'

    log.error('worker import failed', err)
    await finalizeFailedRun(db, importRun.id, reason)
    await markScheduleAndHealth(db, schedule.id, integration.id, 'failed', reason)
    // Re-throw so BullMQ counts this as a failed attempt and applies retry
    // backoff. After `attempts` exhausts, an Incident row is created via
    // BullMQ's failed handler — the worker registration in queue.ts wires
    // that. For unit purposes the important contract is: thrown = retry.
    throw err
  }
}

async function finalizeFailedRun(
  db: PrismaClient,
  importRunId: string,
  reason: string,
): Promise<{ errorSummary: string }> {
  await db.importRun.update({
    where: { id: importRunId },
    data: {
      status: 'failed',
      errorSummary: reason,
      completedAt: new Date(),
    },
  })
  return { errorSummary: reason }
}

async function markScheduleAndHealth(
  db: PrismaClient,
  scheduleId: string,
  integrationId: string,
  status: 'success' | 'partial' | 'failed',
  errorMessage: string | null,
): Promise<void> {
  await db.integrationSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunError: errorMessage,
    },
  })

  if (status === 'success' || status === 'partial') {
    await db.integration.update({
      where: { id: integrationId },
      data: {
        healthStatus: status === 'success' ? 'healthy' : 'degraded',
        ...(status === 'success' ? { lastSuccessfulSyncAt: new Date() } : {}),
        consecutiveFailures: status === 'success' ? 0 : { increment: 0 },
        lastError: errorMessage,
      },
    })
  } else {
    const after = await db.integration.update({
      where: { id: integrationId },
      data: {
        consecutiveFailures: { increment: 1 },
        lastErrorAt: new Date(),
        lastError: errorMessage,
      },
      select: { tenantId: true, consecutiveFailures: true },
    })
    await db.integration.update({
      where: { id: integrationId },
      data: {
        healthStatus: escalateHealth(after.consecutiveFailures),
      },
    })
    // Create an incident so the operator sees the failure in the merchant
    // dashboard. `isUserVisible: true` mirrors PROJECT.md §11.
    await db.incident.create({
      data: {
        tenantId: after.tenantId,
        sourceType: 'job',
        sourceId: scheduleId,
        integrationId,
        severity: 'error',
        code: 'SFTP_IMPORT_FAILED',
        title: 'Scheduled SFTP/FTP import failed',
        userMessage: errorMessage ?? 'The scheduled import did not complete.',
        technicalMessage: errorMessage,
        isUserVisible: true,
      },
    })
  }
}
