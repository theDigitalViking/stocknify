/**
 * Cycle 5-C — Post-import file handling service.
 *
 * Centralises the cleanup decision for both the scheduled worker and the
 * manual-import route. The decision tree:
 *
 *   success | partial → cleanup per `postImportAction` (`archive` | `delete`)
 *   failed + manual  → cleanup immediately per `failedAction` (retries=0)
 *   failed + scheduled → count failed runs of the same filename since the
 *                        last success; cleanup only when the count
 *                        EXCEEDS `maxImportRetries`.
 *
 * Cleanup failures are logged and appended to `ImportRun.errorSummary`; they
 * never throw past the caller so the calling site's own status logic (and
 * BullMQ retry tracking) stays unaffected.
 *
 * Archive destination: `<source-dir>/<subdir>/<YYYY-MM>/<filename>` (UTC
 * date bucket).
 */

import type { PrismaClient } from '@prisma/client'

import {
  deleteFtpFile,
  ensureFtpDirectory,
  moveFtpFile,
  type FtpTestConfig,
} from '../../integrations/ftp-client.js'
import {
  deleteSftpFile,
  ensureSftpDirectory,
  moveSftpFile,
  type SftpTestConfig,
} from '../../integrations/sftp-client.js'
import { baseName, dirName, joinRemotePath } from '../../lib/remote-path.js'

export interface PostImportLogger {
  info: (...a: unknown[]) => void
  warn: (...a: unknown[]) => void
  error: (...a: unknown[]) => void
}

export interface PostImportRemoteConfig {
  host: string
  port: number
  username: string
  password?: string
}

export interface PostImportActionArgs {
  db: PrismaClient
  log: PostImportLogger
  integration: {
    id: string
    tenantId: string
    postImportAction: string
    archiveSubdir: string
    maxImportRetries: number
    failedAction: string
    failedSubdir: string
    lastSuccessfulSyncAt: Date | null
  }
  credentialType: string // 'sftp' | 'ftp' | 'ftps'
  remoteConfig: PostImportRemoteConfig
  sourceFilePath: string
  importRunStatus: 'success' | 'partial' | 'failed'
  importRunId: string
  trigger: 'scheduled' | 'manual'
}

export async function applyPostImportAction(args: PostImportActionArgs): Promise<void> {
  const { importRunStatus, trigger, integration } = args

  // Success path — always cleanup per postImportAction (delete or archive).
  if (importRunStatus === 'success' || importRunStatus === 'partial') {
    await runCleanup({
      ...args,
      action: integration.postImportAction,
      subdir: integration.archiveSubdir,
      label: 'success-cleanup',
    })
    return
  }

  // Failed path — branch on trigger.
  if (trigger === 'manual') {
    // Manual = effective retries 0 → cleanup immediately.
    await runCleanup({
      ...args,
      action: integration.failedAction,
      subdir: integration.failedSubdir,
      label: 'failed-cleanup-manual',
    })
    return
  }

  // Scheduled-failed: count prior failed runs for the same filename since
  // the last success. The current (just-finalised) run is included in the
  // count, so the cleanup triggers once the count EXCEEDS maxImportRetries
  // (e.g. maxImportRetries=3 → cleanup fires on the 4th failed run).
  const fileName = baseName(args.sourceFilePath)
  const since = integration.lastSuccessfulSyncAt
  const failedCount = await args.db.importRun.count({
    where: {
      integrationId: integration.id,
      fileName,
      status: 'failed',
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  })

  if (failedCount > integration.maxImportRetries) {
    await runCleanup({
      ...args,
      action: integration.failedAction,
      subdir: integration.failedSubdir,
      label: 'failed-cleanup-scheduled',
    })
    return
  }

  args.log.info(
    `Scheduled-failed: ${String(failedCount)} of ${String(
      integration.maxImportRetries + 1,
    )} attempts — keeping file for next cron tick`,
  )
}

interface RunCleanupArgs extends PostImportActionArgs {
  action: string
  subdir: string
  label: string
}

async function runCleanup(args: RunCleanupArgs): Promise<void> {
  if (args.action !== 'delete' && args.action !== 'archive') {
    args.log.warn(`Unknown action "${args.action}" — skipping ${args.label}`)
    return
  }

  try {
    if (args.action === 'delete') {
      await deleteRemoteFile(args.credentialType, args.remoteConfig, args.sourceFilePath)
      args.log.info(`${args.label}: deleted ${args.sourceFilePath}`)
      return
    }

    const sourceDir = dirName(args.sourceFilePath)
    const file = baseName(args.sourceFilePath)
    const now = new Date()
    const yearMonth = `${String(now.getUTCFullYear())}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`
    const archiveDir = joinRemotePath(joinRemotePath(sourceDir, args.subdir), yearMonth)
    const destPath = joinRemotePath(archiveDir, file)

    await ensureRemoteDirectory(args.credentialType, args.remoteConfig, archiveDir)
    await moveRemoteFile(args.credentialType, args.remoteConfig, args.sourceFilePath, destPath)
    args.log.info(`${args.label}: moved ${args.sourceFilePath} → ${destPath}`)
  } catch (err) {
    const message =
      err instanceof Error
        ? `${args.label} failed: ${err.message.slice(0, 200)}`
        : `${args.label} failed`
    args.log.warn(message)

    // Append to existing errorSummary so partial-import context is
    // preserved alongside the cleanup-failure note. Caught errors here are
    // soft — the cleanup is best-effort, the original import status stays.
    try {
      const existing = await args.db.importRun.findUnique({
        where: { id: args.importRunId },
        select: { errorSummary: true },
      })
      const combined = existing?.errorSummary
        ? `${existing.errorSummary} | ${message}`
        : message
      await args.db.importRun.update({
        where: { id: args.importRunId },
        data: { errorSummary: combined },
      })
    } catch (writeErr) {
      // If the audit-trail update itself fails, log and move on — never
      // throw out of the cleanup path.
      args.log.error(`${args.label}: errorSummary append failed`, writeErr)
    }
  }
}

function buildSftpConfig(cfg: PostImportRemoteConfig): SftpTestConfig {
  return {
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    ...(cfg.password !== undefined ? { password: cfg.password } : {}),
  }
}

function buildFtpConfig(cfg: PostImportRemoteConfig, secure: boolean): FtpTestConfig {
  return {
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    ...(cfg.password !== undefined ? { password: cfg.password } : {}),
    secure,
  }
}

async function deleteRemoteFile(
  type: string,
  cfg: PostImportRemoteConfig,
  remotePath: string,
): Promise<void> {
  if (type === 'sftp') return deleteSftpFile(buildSftpConfig(cfg), remotePath)
  if (type === 'ftp' || type === 'ftps') {
    return deleteFtpFile(buildFtpConfig(cfg, type === 'ftps'), remotePath)
  }
  throw new Error(`Unsupported credential type: ${type}`)
}

async function moveRemoteFile(
  type: string,
  cfg: PostImportRemoteConfig,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  if (type === 'sftp') {
    return moveSftpFile(buildSftpConfig(cfg), sourcePath, destPath)
  }
  if (type === 'ftp' || type === 'ftps') {
    return moveFtpFile(buildFtpConfig(cfg, type === 'ftps'), sourcePath, destPath)
  }
  throw new Error(`Unsupported credential type: ${type}`)
}

async function ensureRemoteDirectory(
  type: string,
  cfg: PostImportRemoteConfig,
  remotePath: string,
): Promise<void> {
  if (type === 'sftp') return ensureSftpDirectory(buildSftpConfig(cfg), remotePath)
  if (type === 'ftp' || type === 'ftps') {
    return ensureFtpDirectory(buildFtpConfig(cfg, type === 'ftps'), remotePath)
  }
  throw new Error(`Unsupported credential type: ${type}`)
}
