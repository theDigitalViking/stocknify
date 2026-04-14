import { createBrowserClient } from '@supabase/ssr'

import { env } from '@/env'

// Browser (client-side) Supabase client — used in React components and hooks.
// Call this inside components/hooks, not at module level, to avoid SSR issues.
export function createSupabaseBrowserClient(): ReturnType<typeof createBrowserClient> {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
