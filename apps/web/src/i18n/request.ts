import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { routing, type AppLocale } from './routing'

// Locale resolution is deliberately Supabase-free:
// creating a second `createServerClient` here (to read the user's
// `locale` column) caused the middleware-issued refresh cookies to be
// invalidated by a concurrent `supabase.auth.getUser()` call on every
// server render — producing empty sessions in the browser and 401s on
// every API call. The authoritative preference is still stored on
// `users.locale`; the Settings page mirrors it into a simple cookie
// (`stocknify-locale`) that this function reads.
const SUPPORTED = routing.locales

function isSupported(value: string | undefined): value is AppLocale {
  if (!value) return false
  return (SUPPORTED as readonly string[]).includes(value)
}

function parseAcceptLanguage(header: string | null): AppLocale | null {
  if (!header) return null
  const tags = header
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
  for (const tag of tags) {
    const primary = tag.split('-')[0]?.toLowerCase()
    if (isSupported(primary)) return primary
  }
  return null
}

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get('stocknify-locale')?.value?.toLowerCase()
  const headerLocale = parseAcceptLanguage(headers().get('accept-language'))
  const locale: AppLocale =
    (isSupported(cookieLocale) ? cookieLocale : null) ?? headerLocale ?? routing.defaultLocale

  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>
  }
  return { locale, messages: messages.default }
})
