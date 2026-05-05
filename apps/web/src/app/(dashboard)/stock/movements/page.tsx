'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/shared/page-header'
import { StockMovementChart } from '@/components/stock/stock-movement-chart'
import { StockMovementTable } from '@/components/stock/stock-movement-table'
import { useStockMovements } from '@/lib/api/use-stock-movements'

const DEFAULT_PER_PAGE = 50
const CHART_PER_PAGE = 200 // wider window so the area chart shows real history

export default function StockMovementsPage(): JSX.Element {
  const t = useTranslations('stockMovements')
  const tStock = useTranslations('stock')
  const search = useSearchParams()

  const variantId = search.get('variantId') ?? undefined
  const productId = search.get('productId') ?? undefined
  const locationId = search.get('locationId') ?? undefined
  const stockType = search.get('stockType') ?? undefined

  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const tableFilters = useMemo(
    () => ({
      variantId,
      productId,
      locationId,
      stockType,
      page,
      perPage: DEFAULT_PER_PAGE,
      sortDir,
    }),
    [variantId, productId, locationId, stockType, page, sortDir],
  )

  // The chart needs ascending data over a wider window. Use a separate query
  // so chart and table can paginate/sort independently.
  const chartFilters = useMemo(
    () => ({
      variantId,
      productId,
      locationId,
      stockType,
      page: 1,
      perPage: CHART_PER_PAGE,
      sortDir: 'asc' as const,
    }),
    [variantId, productId, locationId, stockType],
  )

  const { data: tableData, isLoading: tableLoading } = useStockMovements(tableFilters)
  const { data: chartData } = useStockMovements(chartFilters)

  const hasChartFilters = Boolean(variantId && locationId && stockType)
  const chartRows = chartData?.data ?? []

  return (
    <div>
      <div className="h-12 border-b border-border px-6 flex items-center gap-2 text-sm">
        <Link
          href="/stock"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {tStock('title')}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{t('title')}</span>
      </div>

      <PageHeader title={t('title')} />

      <div className="px-6 py-6 space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('chart.title')}</h2>
          {hasChartFilters ? (
            <StockMovementChart
              movements={chartRows}
              emptyTitle={t('chart.empty.title')}
              emptyDescription={t('chart.empty.description')}
            />
          ) : (
            <div className="rounded-md border border-border h-64 flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm font-medium text-foreground">
                {t('chart.filtersRequired.title')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('chart.filtersRequired.description')}
              </p>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('table.title')}</h2>
          <StockMovementTable
            rows={tableData?.data ?? []}
            total={tableData?.meta.total ?? 0}
            page={page}
            perPage={DEFAULT_PER_PAGE}
            sortDir={sortDir}
            isLoading={tableLoading}
            onPageChange={(next) => {
              if (next >= 1) setPage(next)
            }}
            onSortToggle={() => {
              setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))
              setPage(1)
            }}
          />
        </section>
      </div>
    </div>
  )
}
