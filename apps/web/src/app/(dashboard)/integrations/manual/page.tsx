'use client'

import { useTranslations } from 'next-intl'

import { CsvImportPanel } from '@/components/csv/csv-import-panel'
import { MappingTemplatesPanel } from '@/components/csv/mapping-templates-panel'
import { PageHeader } from '@/components/shared/page-header'

export default function ManualPage(): JSX.Element {
  const t = useTranslations('integrations.manual')

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="px-6 py-6 space-y-10">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('importSection')}</h2>
          <CsvImportPanel />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('templatesSection')}</h2>
          <MappingTemplatesPanel />
        </section>
      </div>
    </div>
  )
}
