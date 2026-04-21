import { createSupabaseBrowserClient } from '../supabase'

import { env } from '@/env'

async function getAuthHeader(): Promise<{ Authorization: string }> {
  const supabase = createSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token ?? ''}` }
}

interface ApiEnvelope<T> {
  data?: T
  error?: { code: string; message: string }
  meta?: Record<string, unknown>
}

// Error thrown by apiFetch when the backend returns a structured error envelope.
// Preserves the error `code` so callers can branch on specific failures
// (e.g. BATCH_STOCK_EXISTS) instead of string-matching the message.
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options?.headers,
    },
  })

  // Handle empty responses (204 No Content, 205 Reset Content)
  if (res.status === 204 || res.status === 205) {
    return undefined as T
  }

  // Handle empty body (Content-Length: 0 or non-JSON content-type)
  const contentType = res.headers.get('content-type')
  const contentLength = res.headers.get('content-length')
  if (contentLength === '0' || !contentType?.includes('application/json')) {
    if (!res.ok) {
      throw new ApiError(
        `Request failed with status ${String(res.status)}`,
        'HTTP_ERROR',
        res.status,
      )
    }
    return undefined as T
  }

  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok) {
    throw new ApiError(
      json.error?.message ?? `Request failed with status ${String(res.status)}`,
      json.error?.code ?? 'HTTP_ERROR',
      res.status,
    )
  }
  if (json.error) throw new ApiError(json.error.message, json.error.code, res.status)
  if (json.data === undefined) throw new ApiError(`Malformed response from ${path}`, 'MALFORMED_RESPONSE', res.status)
  return json.data
}

export function toQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)])
  if (entries.length === 0) return ''
  return `?${new URLSearchParams(entries).toString()}`
}
