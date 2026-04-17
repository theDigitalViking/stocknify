'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/shared/page-header'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { useUpdateUser } from '@/lib/api/use-users'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const LOCALE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
]

export default function SettingsPage(): JSX.Element {
  const t = useTranslations('settings')
  const currentLocale = useLocale()
  const [userId, setUserId] = useState<string | null>(null)
  const [locale, setLocale] = useState<string>(currentLocale)
  const update = useUpdateUser()

  useEffect(() => {
    // Resolve the signed-in user id client-side so the Select can PATCH
    // /users/:id without depending on the admin-scoped /users list.
    const supabase = createSupabaseBrowserClient()
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  async function handleLocaleChange(next: string): Promise<void> {
    if (!userId || next === locale) return
    const previous = locale
    setLocale(next)
    try {
      await update.mutateAsync({ id: userId, locale: next })
      toast({ title: t('account.languageSaved') })
      // Reload so server-resolved messages reflect the new preference.
      window.location.reload()
    } catch (err) {
      setLocale(previous)
      const message = err instanceof Error ? err.message : t('account.languageSaveFailed')
      toast({
        title: t('account.languageSaveFailed'),
        description: message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="px-6 py-6 max-w-2xl space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('account.title')}</h2>
          <div className="space-y-2">
            <Label htmlFor="language" className="block">
              {t('account.language')}
            </Label>
            <Select
              value={locale}
              onValueChange={(value) => {
                void handleLocaleChange(value)
              }}
            >
              <SelectTrigger id="language" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('account.languageHelp')}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
