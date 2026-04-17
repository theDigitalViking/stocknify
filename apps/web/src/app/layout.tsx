import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: {
    template: '%s | Stocknify',
    default: 'Stocknify — Inventory Intelligence',
  },
  description:
    'Real-time inventory monitoring across all your fulfillers and sales channels.',
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default async function RootLayout({ children }: RootLayoutProps): Promise<JSX.Element> {
  let locale = 'en'
  let messages: Record<string, unknown> = {}

  try {
    locale = await getLocale()
    messages = await getMessages() as Record<string, unknown>
  } catch {
    // getLocale/getMessages can fail on the root redirect route — fall back to defaults
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
