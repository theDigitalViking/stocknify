import { createSupabaseBrowserClient } from './supabase'

// Auth helper functions — thin wrappers around the Supabase client
// so callers don't need to instantiate the client themselves.

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message ?? null }
}

export async function signUp(
  email: string,
  password: string,
  metadata?: { firstName?: string; lastName?: string; companyName?: string },
): Promise<{ error: string | null }> {
  const supabase = createSupabaseBrowserClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  })
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseBrowserClient()
  await supabase.auth.signOut()
}

export async function getSession(): Promise<
  Awaited<ReturnType<ReturnType<typeof createSupabaseBrowserClient>['auth']['getSession']>>
> {
  const supabase = createSupabaseBrowserClient()
  return supabase.auth.getSession()
}
