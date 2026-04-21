'use client'

import { useTranslations } from 'next-intl'

import { PageHeader } from '@/components/shared/page-header'

export default function AutomaticPage(): JSX.Element {
  const t = useTranslations('integrations.automatic')

  return (
    <div>
      <PageHeader title={t('title')} />
      <div className="px-6 py-6 text-muted-foreground text-sm">{t('comingSoon')}</div>
    </div>
  )
}
