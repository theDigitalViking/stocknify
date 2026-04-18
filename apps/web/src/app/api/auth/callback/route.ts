import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

// Supabase auth callback — exchanges the auth code for a session.
// Supabase redirects here after email confirmation / OAuth login.
// Configure this URL in Supabase: Authentication → URL Configuration →
// Redirect URLs: https://app.stocknify.app/api/auth/callback
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  // Default target is /login?confirmed=true so the user re-authenticates
  // explicitly after clicking the email-confirmation link. A caller that
  // needs a different destination can override via ?next=.
  const next = requestUrl.searchParams.get('next') ?? '/login?confirmed=true'

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  // Something went wrong — redirect to login with error param
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', requestUrl.origin))
}
