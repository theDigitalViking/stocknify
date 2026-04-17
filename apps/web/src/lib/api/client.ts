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
  const json = (await res.json()) as ApiEnvelope<T>
  if (json.error) throw new Error(json.error.message)
  if (json.data === undefined) throw new Error(`Malformed response from ${path}`)
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
