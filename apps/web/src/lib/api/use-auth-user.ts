'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { createSupabaseBrowserClient } from '../supabase'

export interface AuthUserSummary {
  id: string
  email: string | null
  // Display name composed from `firstName lastName` when available, falling
  // back to `fullName`. May be null if the user signed up without metadata.
  displayName: string | null
}

// Pulls the currently signed-in Supabase auth user (id + email + best-effort
// display name) for surfaces that show "who's logged in" — primarily the
// sidebar identity block. Cached via TanStack so multiple consumers share
// one read instead of each calling `supabase.auth.getUser()` independently.
export function useAuthUser(): UseQueryResult<AuthUserSummary | null> {
  return useQuery<AuthUserSummary | null>({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient()
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) return null
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const first = typeof meta['firstName'] === 'string' ? (meta['firstName'] as string) : ''
      const last = typeof meta['lastName'] === 'string' ? (meta['lastName'] as string) : ''
      const composed = `${first} ${last}`.trim()
      const fallback = typeof meta['fullName'] === 'string' ? (meta['fullName'] as string) : ''
      const displayName = composed || fallback || null
      return { id: user.id, email: user.email ?? null, displayName }
    },
    staleTime: 5 * 60 * 1000,
  })
}
