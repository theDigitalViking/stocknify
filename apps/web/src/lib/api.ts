import { createSupabaseBrowserClient } from './supabase'

import { env } from '@/env'

// Base API client that attaches the Supabase JWT to every request
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { 'Content-Type': 'application/json' }
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders()
  const url = `${env.NEXT_PUBLIC_API_URL}/v1${path}`

  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...init?.headers },
  })

  const body = (await response.json()) as unknown

  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } }
    throw new Error(errorBody.error?.message ?? `HTTP ${String(response.status)}`)
  }

  return body as T
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
}
