'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CsvImportPanel } from '@/components/csv/csv-import-panel'
import { MappingTemplatesPanel } from '@/components/csv/mapping-templates-panel'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

type TabKey = 'import' | 'templates'

export default function IntegrationsPage(): JSX.Element {
  const t = useTranslations('csv.tabs')
  const tPage = useTranslations('nav')
  const [tab, setTab] = useState<TabKey>('import')

  return (
    <div>
      <PageHeader title={tPage('integrations')} />

      <div className="border-b border-border px-6">
        <div className="flex items-center gap-1">
          <TabButton label={t('import')} active={tab === 'import'} onClick={() => setTab('import')} />
          <TabButton
            label={t('templates')}
            active={tab === 'templates'}
            onClick={() => setTab('templates')}
          />
        </div>
      </div>

      <div className="px-6 py-6">
        {tab === 'import' ? <CsvImportPanel /> : <MappingTemplatesPanel />}
      </div>
    </div>
  )
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 px-3 text-sm transition-colors border-b-2 -mb-px',
        active
          ? 'border-brand-600 text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
