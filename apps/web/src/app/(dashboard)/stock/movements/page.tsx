'use client'

import { startOfDay, endOfDay, subDays } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import { PageHeader } from '@/components/shared/page-header'
import { StockMovementChart } from '@/components/stock/stock-movement-chart'
import { StockMovementTable } from '@/components/stock/stock-movement-table'
import { Button } from '@/components/ui/button'
import { useStockMovements } from '@/lib/api/use-stock-movements'

const DEFAULT_PER_PAGE = 50
const CHART_PER_PAGE = 200 // wider window so the area chart shows real history
const DEFAULT_RANGE_DAYS = 30

const PRESETS = [
  { key: '7d', days: 7 },
  { key: '14d', days: 14 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
] as const

type PresetKey = (typeof PRESETS)[number]['key']

interface RangeState {
  from: string | undefined
  to: string | undefined
  activePreset: PresetKey | null
}

function rangeForPreset(days: number): { from: string; to: string } {
  const now = new Date()
  return {
    from: subDays(startOfDay(now), days).toISOString(),
    to: endOfDay(now).toISOString(),
  }
}

// Render an ISO timestamp as the user's local YYYY-MM-DD for an <input type="date">.
function isoToDateInput(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dateInputToIsoStartOfDay(value: string): string | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
}

function dateInputToIsoEndOfDay(value: string): string | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

export default function StockMovementsPage(): JSX.Element {
  const t = useTranslations('stockMovements')
  const tStock = useTranslations('stock')
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  const variantId = search.get('variantId') ?? undefined
  const productId = search.get('productId') ?? undefined
  const locationId = search.get('locationId') ?? undefined
  const stockType = search.get('stockType') ?? undefined

  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [range, setRange] = useState<RangeState>(() => {
    const urlFrom = search.get('from') ?? undefined
    const urlTo = search.get('to') ?? undefined
    if (urlFrom || urlTo) {
      return { from: urlFrom, to: urlTo, activePreset: null }
    }
    const { from, to } = rangeForPreset(DEFAULT_RANGE_DAYS)
    return { from, to, activePreset: '30d' }
  })

  const writeRangeToUrl = useCallback(
    (next: { from: string | undefined; to: string | undefined }) => {
      const params = new URLSearchParams(search.toString())
      if (next.from) params.set('from', next.from)
      else params.delete('from')
      if (next.to) params.set('to', next.to)
      else params.delete('to')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, search],
  )

  const applyPreset = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      const { from, to } = rangeForPreset(preset.days)
      setRange({ from, to, activePreset: preset.key })
      setPage(1)
      writeRangeToUrl({ from, to })
    },
    [writeRangeToUrl],
  )

  const applyCustomFrom = useCallback(
    (value: string) => {
      const next = {
        from: dateInputToIsoStartOfDay(value),
        to: range.to,
      }
      setRange({ ...next, activePreset: null })
      setPage(1)
      writeRangeToUrl(next)
    },
    [range.to, writeRangeToUrl],
  )

  const applyCustomTo = useCallback(
    (value: string) => {
      const next = {
        from: range.from,
        to: dateInputToIsoEndOfDay(value),
      }
      setRange({ ...next, activePreset: null })
      setPage(1)
      writeRangeToUrl(next)
    },
    [range.from, writeRangeToUrl],
  )

  const tableFilters = useMemo(
    () => ({
      variantId,
      productId,
      locationId,
      stockType,
      from: range.from,
      to: range.to,
      page,
      perPage: DEFAULT_PER_PAGE,
      sortDir,
    }),
    [variantId, productId, locationId, stockType, range.from, range.to, page, sortDir],
  )

  // The chart needs ascending data over a wider window. Use a separate query
  // so chart and table can paginate/sort independently.
  const chartFilters = useMemo(
    () => ({
      variantId,
      productId,
      locationId,
      stockType,
      from: range.from,
      to: range.to,
      page: 1,
      perPage: CHART_PER_PAGE,
      sortDir: 'asc' as const,
    }),
    [variantId, productId, locationId, stockType, range.from, range.to],
  )

  const { data: tableData, isLoading: tableLoading } = useStockMovements(tableFilters)
  const { data: chartData } = useStockMovements(chartFilters)

  const hasChartFilters = Boolean(variantId && locationId && stockType)
  const chartRows = chartData?.data ?? []
  const hasRange = Boolean(range.from || range.to)
  const chartEmptyTitle = hasRange ? t('chart.emptyRange.title') : t('chart.empty.title')
  const chartEmptyDescription = hasRange
    ? t('chart.emptyRange.description')
    : t('chart.empty.description')

  const fromInputValue = isoToDateInput(range.from)
  const toInputValue = isoToDateInput(range.to)

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

          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t('rangeLabel')}
            >
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  size="sm"
                  variant={range.activePreset === preset.key ? 'default' : 'outline'}
                  onClick={() => applyPreset(preset)}
                  aria-pressed={range.activePreset === preset.key}
                >
                  {t(`presets.${preset.key}`)}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground sr-only" htmlFor="movements-from">
                {t('fromLabel')}
              </label>
              <input
                id="movements-from"
                type="date"
                value={fromInputValue}
                max={toInputValue || undefined}
                onChange={(event) => applyCustomFrom(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="hidden text-muted-foreground md:inline" aria-hidden="true">
                –
              </span>
              <label className="text-xs text-muted-foreground sr-only" htmlFor="movements-to">
                {t('toLabel')}
              </label>
              <input
                id="movements-to"
                type="date"
                value={toInputValue}
                min={fromInputValue || undefined}
                onChange={(event) => applyCustomTo(event.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {hasChartFilters ? (
            <StockMovementChart
              movements={chartRows}
              emptyTitle={chartEmptyTitle}
              emptyDescription={chartEmptyDescription}
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
