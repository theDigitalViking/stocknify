/**
 * Thin wrapper around `ssh2-sftp-client` for credential connection tests.
 * Cycle 3-C will extend this module with `listDirectory` / `streamFile` for
 * the actual SFTP import pipeline; this file only ships the connect-and-
 * disconnect shape the credential vault needs.
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

const CONNECT_TIMEOUT_MS = 10_000

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
