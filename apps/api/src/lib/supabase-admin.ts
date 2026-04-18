import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { config } from '../config.js'

// Service-role Supabase client — bypasses RLS via the service_role JWT.
// Used for: setting app_metadata on auth.users, writing to tables that are
// deny-by-default under RLS (e.g. incidents).
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Invite a user by email via the Supabase Auth admin API.
 * `data` is stored in user_metadata so the auth webhook can read tenant_id and role.
 * Returns the new user's UUID on success; throws on failure.
 */
export async function inviteUserByEmail(
  email: string,
  metadata?: { tenant_id?: string; role?: string },
): Promise<{ id: string }> {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ email, data: metadata }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, string>
    const message = body['msg'] ?? body['message'] ?? 'Failed to invite user'
    throw new Error(message)
  }

  const data = (await response.json()) as { id?: string }
  if (!data.id) {
    throw new Error('Invite succeeded but no user ID returned from Supabase')
  }
  return { id: data.id }
}
