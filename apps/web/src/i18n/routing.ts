import { defineRouting } from 'next-intl/routing'

// Supported application locales. Must match the top-level keys available
// in `apps/web/messages/<locale>.json`.
export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  localePrefix: 'never',
})

export type AppLocale = (typeof routing.locales)[number]
