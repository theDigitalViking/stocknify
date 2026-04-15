import { config } from '../config.js'

/**
 * Invite a user by email via the Supabase Auth admin API.
 * Returns the new user's UUID on success; throws on failure.
 */
export async function inviteUserByEmail(email: string): Promise<{ id: string }> {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ email }),
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
