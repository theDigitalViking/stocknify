/**
 * Thin wrapper around `basic-ftp` for FTP / FTPS credential connection tests.
 * Cycle 3-C will extend this module with `listDirectory` / `streamFile` for
 * the actual FTP import pipeline.
 */

import { Client as FtpClient } from 'basic-ftp'

import {
  sanitizeConnectionError,
  withTimeout,
  type ConnectionTestResult,
} from './connection-utils.js'

export interface FtpTestConfig {
  host: string
  port: number
  username: string
  password?: string
  secure: boolean
}

const CONNECT_TIMEOUT_MS = 10_000

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
