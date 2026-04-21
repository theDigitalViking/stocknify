'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { CsvImportPanel } from '@/components/csv/csv-import-panel'

export default function StockImportPage(): JSX.Element {
  const t = useTranslations('stock')

  return (
    <div>
      <div className="h-12 border-b border-border px-6 flex items-center gap-2 text-sm">
        <Link
          href="/stock"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('title')}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{t('import.title')}</span>
      </div>

      <div className="px-6 py-6">
        <CsvImportPanel defaultResourceType="stock" />
      </div>
    </div>
  )
}
