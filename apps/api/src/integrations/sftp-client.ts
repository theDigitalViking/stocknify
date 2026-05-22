/**
 * Thin wrapper around `ssh2-sftp-client` for credential connection tests
 * plus the directory-listing / file-streaming primitives the SFTP import
 * pipeline (Cycle 3-C) calls.
 */

import SftpClient from 'ssh2-sftp-client'

import { sanitizeConnectionError, withTimeout } from './connection-utils.js'

export interface SftpTestConfig {
  host: string
  port: number
  username: string
  password?: string
}

export interface ConnectionTestResult {
  success: boolean
  error?: string
}

// Shared file-info shape returned by both SFTP and FTP listings (R1+R2).
// `modifiedAt` is ISO-8601 UTC; `type` collapses to file/directory (symlinks
// surface as their resolved kind on most servers — we don't follow them).
export interface SftpFileInfo {
  name: string
  size: number
  modifiedAt: string
  type: 'file' | 'directory'
}

export interface SftpStreamHandle {
  stream: NodeJS.ReadableStream
  cleanup: () => Promise<void>
}

const CONNECT_TIMEOUT_MS = 10_000
const LIST_TIMEOUT_MS = 30_000
const OP_TIMEOUT_MS = 30_000

export async function testSftpConnection(
  config: SftpTestConfig,
): Promise<ConnectionTestResult> {
  const client = new SftpClient()
  try {
    await withTimeout(
      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        ...(config.password !== undefined ? { password: config.password } : {}),
        readyTimeout: CONNECT_TIMEOUT_MS,
      }),
      CONNECT_TIMEOUT_MS,
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: sanitizeConnectionError(err) }
  } finally {
    // `end()` is safe to call even if connect threw partway through.
    try {
      await client.end()
    } catch {
      // ignore — disconnect failures shouldn't override the connect outcome.
    }
  }
}

async function connectSftp(config: SftpTestConfig): Promise<SftpClient> {
  const client = new SftpClient()
  await withTimeout(
    client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      ...(config.password !== undefined ? { password: config.password } : {}),
      readyTimeout: CONNECT_TIMEOUT_MS,
    }),
    CONNECT_TIMEOUT_MS,
  )
  return client
}

export async function listSftpDirectory(
  config: SftpTestConfig,
  remotePath: string,
  filter?: { extension?: string },
): Promise<SftpFileInfo[]> {
  const client = await connectSftp(config)
  try {
    const entries = await withTimeout(client.list(remotePath), LIST_TIMEOUT_MS)
    const ext = filter?.extension?.toLowerCase()
    const mapped: SftpFileInfo[] = []
    for (const entry of entries) {
      const isFile = entry.type === '-'
      const isDir = entry.type === 'd'
      if (!isFile && !isDir) continue
      if (ext && isFile && !entry.name.toLowerCase().endsWith(ext)) continue
      mapped.push({
        name: entry.name,
        size: entry.size,
        // `modifyTime` is epoch milliseconds on ssh2-sftp-client.
        modifiedAt: new Date(entry.modifyTime).toISOString(),
        type: isDir ? 'directory' : 'file',
      })
    }
    mapped.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
    return mapped
  } finally {
    try {
      await client.end()
    } catch {
      // ignore disconnect failures
    }
  }
}

// Post-import file-handling primitives (Cycle 5-C). Each opens its own
// client, runs one op, and closes — symmetric with the existing list/stream
// helpers. Errors propagate through `sanitizeConnectionError` so the
// caller gets a sanitised string (no stack traces / paths leaking).

export async function ensureSftpDirectory(
  config: SftpTestConfig,
  remotePath: string,
): Promise<void> {
  const client = await connectSftp(config)
  try {
    // ssh2-sftp-client's mkdir(path, recursive). The recursive flag both
    // creates intermediate segments and swallows the "already exists" error
    // on the final segment, which is exactly the idempotent semantics the
    // archive flow needs.
    await withTimeout(client.mkdir(remotePath, true), OP_TIMEOUT_MS)
  } catch (err) {
    throw new Error(sanitizeConnectionError(err))
  } finally {
    try {
      await client.end()
    } catch {
      // ignore disconnect failures
    }
  }
}

export async function moveSftpFile(
  config: SftpTestConfig,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const client = await connectSftp(config)
  try {
    await withTimeout(client.rename(sourcePath, destPath), OP_TIMEOUT_MS)
  } catch (err) {
    throw new Error(sanitizeConnectionError(err))
  } finally {
    try {
      await client.end()
    } catch {
      // ignore
    }
  }
}

export async function deleteSftpFile(
  config: SftpTestConfig,
  remotePath: string,
): Promise<void> {
  const client = await connectSftp(config)
  try {
    await withTimeout(client.delete(remotePath), OP_TIMEOUT_MS)
  } catch (err) {
    throw new Error(sanitizeConnectionError(err))
  } finally {
    try {
      await client.end()
    } catch {
      // ignore
    }
  }
}

export async function streamSftpFile(
  config: SftpTestConfig,
  remotePath: string,
): Promise<SftpStreamHandle> {
  const client = await connectSftp(config)
  try {
    const stream = client.createReadStream(remotePath)
    return {
      stream,
      cleanup: async () => {
        try {
          await client.end()
        } catch {
          // ignore — caller already consumed (or aborted) the stream.
        }
      },
    }
  } catch (err) {
    // Connect succeeded but stream creation failed — release the connection
    // and rethrow so the caller can still surface the error.
    try {
      await client.end()
    } catch {
      // ignore
    }
    throw err
  }
}
