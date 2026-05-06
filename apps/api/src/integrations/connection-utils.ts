/**
 * Shared helpers for SFTP/FTP connection tests: timeout enforcement and
 * error-message sanitization (no stack traces, no internal paths).
 */

export interface ConnectionTestResult {
  success: boolean
  error?: string
}

const MAX_ERROR_MESSAGE_LENGTH = 200

export class ConnectionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Connection timed out after ${String(Math.round(timeoutMs / 1000))} seconds`)
    this.name = 'ConnectionTimeoutError'
  }
}

/**
 * Race a promise against a timeout. The wrapped promise's resolution always
 * wins if it settles first; if the timeout fires first, throws
 * `ConnectionTimeoutError`. The wrapped operation's library-level timeout
 * (e.g. ssh2's `readyTimeout`) is the first line of defense; this is the
 * outer guard for libraries that don't honor their own setting.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ConnectionTimeoutError(timeoutMs))
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  })
}

/**
 * Strip newlines, file paths, and oversize content from an error message
 * before surfacing it through the API. Internal stack frames are never
 * exposed; only the message text from the error is considered.
 */
export function sanitizeConnectionError(err: unknown): string {
  if (err instanceof ConnectionTimeoutError) {
    return err.message
  }
  let raw: string
  if (err instanceof Error) {
    raw = err.message
  } else if (typeof err === 'string') {
    raw = err
  } else {
    raw = 'Connection failed'
  }
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) {
    return 'Connection failed'
  }
  if (collapsed.length > MAX_ERROR_MESSAGE_LENGTH) {
    return `${collapsed.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
  }
  return collapsed
}
