import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { routing, type AppLocale } from './routing'

type SupportedLocale = AppLocale

const SUPPORTED: readonly SupportedLocale[] = routing.locales

function isSupported(value: string): value is SupportedLocale {
  return (SUPPORTED as readonly string[]).includes(value)
}

function parseAcceptLanguage(header: string | null): SupportedLocale | null {
  if (!header) return null
  // Accept-Language syntax: "de-DE,de;q=0.9,en;q=0.8"
  const tags = header
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
  for (const tag of tags) {
    const primary = tag.split('-')[0]?.toLowerCase()
    if (primary && isSupported(primary)) return primary
  }
  return null
}

async function resolveUserLocale(): Promise<SupportedLocale | null> {
  try {
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
            cookiesToSet.forEach(({ name, value, options }) => {
              try {
                cookieStore.set(name, value, options)
              } catch {
                // Server Components cannot mutate cookies; ignore.
              }
            })
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    // The users.locale column is populated by the backend JWT sync hook.
    // Read it directly — the user is authenticated so RLS on users is scoped.
    const { data } = await supabase.from('users').select('locale').eq('id', user.id).single()
    const locale = (data as { locale?: string | null } | null)?.locale?.toLowerCase()
    if (locale && isSupported(locale)) return locale
    return null
  } catch {
    return null
  }
}

export default getRequestConfig(async () => {
  const userLocale = await resolveUserLocale()
  const headerLocale = parseAcceptLanguage(headers().get('accept-language'))
  const locale: SupportedLocale = userLocale ?? headerLocale ?? routing.defaultLocale

  const messages = (await import(`../../messages/${locale}.json`)) as { default: Record<string, unknown> }
  return { locale, messages: messages.default }
})
