/**
 * Thin wrapper around `basic-ftp` for FTP / FTPS credential connection tests
 * plus the directory-listing / file-streaming primitives the FTP import
 * pipeline (Cycle 3-C) calls.
 */

import { PassThrough } from 'node:stream'

import { Client as FtpClient, FileType } from 'basic-ftp'

import {
  sanitizeConnectionError,
  withTimeout,
  type ConnectionTestResult,
} from './connection-utils.js'
import type { SftpFileInfo, SftpStreamHandle } from './sftp-client.js'

export interface FtpTestConfig {
  host: string
  port: number
  username: string
  password?: string
  secure: boolean
}

const CONNECT_TIMEOUT_MS = 10_000
const LIST_TIMEOUT_MS = 30_000
const OP_TIMEOUT_MS = 30_000

export async function testFtpConnection(config: FtpTestConfig): Promise<ConnectionTestResult> {
  const client = new FtpClient(CONNECT_TIMEOUT_MS)
  try {
    await withTimeout(
      client.access({
        host: config.host,
        port: config.port,
        user: config.username,
        ...(config.password !== undefined ? { password: config.password } : {}),
        secure: config.secure,
      }),
      CONNECT_TIMEOUT_MS,
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: sanitizeConnectionError(err) }
  } finally {
    try {
      client.close()
    } catch {
      // ignore — disconnect failures shouldn't override the connect outcome.
    }
  }
}

async function connectFtp(config: FtpTestConfig): Promise<FtpClient> {
  const client = new FtpClient(CONNECT_TIMEOUT_MS)
  await withTimeout(
    client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      ...(config.password !== undefined ? { password: config.password } : {}),
      secure: config.secure,
    }),
    CONNECT_TIMEOUT_MS,
  )
  return client
}

export async function listFtpDirectory(
  config: FtpTestConfig,
  remotePath: string,
  filter?: { extension?: string },
): Promise<SftpFileInfo[]> {
  const client = await connectFtp(config)
  try {
    const entries = await withTimeout(client.list(remotePath), LIST_TIMEOUT_MS)
    const ext = filter?.extension?.toLowerCase()
    const mapped: SftpFileInfo[] = []
    for (const entry of entries) {
      const isFile = entry.type === FileType.File
      const isDir = entry.type === FileType.Directory
      if (!isFile && !isDir) continue
      if (ext && isFile && !entry.name.toLowerCase().endsWith(ext)) continue
      // basic-ftp's `modifiedAt` is only set when the server speaks MLSD.
      // Older servers leave only the unparsed `rawModifiedAt`; we fall back
      // to "now" so sorting is deterministic — operators on legacy FTP
      // servers should rely on filename, not server timestamp, anyway.
      const modifiedAt = entry.modifiedAt
        ? entry.modifiedAt.toISOString()
        : new Date().toISOString()
      mapped.push({
        name: entry.name,
        size: entry.size,
        modifiedAt,
        type: isDir ? 'directory' : 'file',
      })
    }
    mapped.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
    return mapped
  } finally {
    try {
      client.close()
    } catch {
      // ignore disconnect failures
    }
  }
}

// Post-import file-handling primitives (Cycle 5-C). basic-ftp's API:
//   ensureDir(path)  → recursive mkdir, idempotent
//   rename(src, dest) → atomic move
//   remove(path)     → delete file
// Each opens its own connection, runs one op, and closes. Errors funnel
// through the sanitizer for consistent operator-facing messages.

export async function ensureFtpDirectory(
  config: FtpTestConfig,
  remotePath: string,
): Promise<void> {
  const client = await connectFtp(config)
  try {
    await withTimeout(client.ensureDir(remotePath), OP_TIMEOUT_MS)
  } catch (err) {
    throw new Error(sanitizeConnectionError(err))
  } finally {
    try {
      client.close()
    } catch {
      // ignore
    }
  }
}

export async function moveFtpFile(
  config: FtpTestConfig,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const client = await connectFtp(config)
  try {
    await withTimeout(client.rename(sourcePath, destPath), OP_TIMEOUT_MS)
  } catch (err) {
    throw new Error(sanitizeConnectionError(err))
  } finally {
    try {
      client.close()
    } catch {
      // ignore
    }
  }
}

export async function deleteFtpFile(
  config: FtpTestConfig,
  remotePath: string,
): Promise<void> {
  const client = await connectFtp(config)
  try {
    await withTimeout(client.remove(remotePath), OP_TIMEOUT_MS)
  } catch (err) {
    throw new Error(sanitizeConnectionError(err))
  } finally {
    try {
      client.close()
    } catch {
      // ignore
    }
  }
}

export async function streamFtpFile(
  config: FtpTestConfig,
  remotePath: string,
): Promise<SftpStreamHandle> {
  const client = await connectFtp(config)
  // basic-ftp's downloadTo writes to a Writable; we tee through a PassThrough
  // so the caller gets a Readable. The download promise runs in the
  // background — when it settles, the PassThrough closes naturally.
  const passThrough = new PassThrough()
  // Surface download errors on the stream so the caller's pipeline catches
  // them through the standard 'error' event rather than an unhandled
  // promise rejection.
  client
    .downloadTo(passThrough, remotePath)
    .catch((err: unknown) => {
      passThrough.destroy(err instanceof Error ? err : new Error(String(err)))
    })
  return {
    stream: passThrough,
    cleanup: async () => {
      try {
        client.close()
      } catch {
        // ignore
      }
    },
  }
}
