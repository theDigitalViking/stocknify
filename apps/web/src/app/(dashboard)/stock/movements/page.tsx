'use client'

import { startOfDay, endOfDay, subDays } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader } from '@/components/shared/page-header'
import {
  MovementFilters,
  selectionsEqual,
  type FilterOption,
  type FilterSelection,
} from '@/components/stock/movement-filters'
import {
  StockMovementChart,
  type StockMovementSeries,
} from '@/components/stock/stock-movement-chart'
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

// `days` is inclusive of today: a 7d preset spans today + 6 prior days = 7
// calendar days. Off-by-one in the prior implementation made every preset
// one day wider than its label suggested.
function rangeForPreset(days: number): { from: string; to: string } {
  const now = new Date()
  return {
    from: subDays(startOfDay(now), days - 1).toISOString(),
    to: endOfDay(now).toISOString(),
  }
}

function parseValidIso(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

interface ParsedUrlRange {
  from: string | undefined
  to: string | undefined
  isValid: boolean
  hadParams: boolean
}

// Parses raw URL `from`/`to` query params into normalized ISO strings or
// flags the pair as invalid. Invalid covers: an unparseable string in
// either slot, or `from` later than `to`. Callers fall back to the default
// range and rewrite the URL when invalid so a malformed shared link can't
// keep firing 4xx responses against the API.
function parseUrlRange(rawFrom: string | null, rawTo: string | null): ParsedUrlRange {
  const hadParams = Boolean(rawFrom || rawTo)
  if (!hadParams) return { from: undefined, to: undefined, isValid: true, hadParams: false }
  const from = parseValidIso(rawFrom)
  const to = parseValidIso(rawTo)
  const fromInvalid = Boolean(rawFrom) && from === undefined
  const toInvalid = Boolean(rawTo) && to === undefined
  const orderInvalid =
    from !== undefined &&
    to !== undefined &&
    new Date(from).getTime() > new Date(to).getTime()
  if (fromInvalid || toInvalid || orderInvalid) {
    return { from: undefined, to: undefined, isValid: false, hadParams: true }
  }
  return { from, to, isValid: true, hadParams: true }
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

// Parse a comma-separated multi-select URL param. Empty/missing → 'all'
// (sentinel meaning "no explicit selection"). Explicit empty value
// (`?locations=`) is treated as 'all' too — there is no use for an
// "explicitly empty" URL state since the user can clear the param entirely.
function parseFilterParam(raw: string | null, fallback: string | null | undefined): FilterSelection {
  if (raw === null) {
    if (fallback) return new Set([fallback])
    return 'all'
  }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return 'all'
  return new Set(parts)
}

function selectionToParam(selection: FilterSelection): string | null {
  if (selection === 'all') return null
  if (selection.size === 0) return ''
  return Array.from(selection).join(',')
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

  const hasSingleLineFilters = Boolean(variantId && locationId && stockType)
  const isProductMode = Boolean(productId) && !hasSingleLineFilters

  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Stable default-30d ISOs computed once at mount. Reused by the URL-empty
  // sync branch below so URL→state→URL round-trips don't bounce on millis.
  const defaultRangeRef = useRef<{ from: string; to: string }>(rangeForPreset(DEFAULT_RANGE_DAYS))

  const [range, setRange] = useState<RangeState>(() => {
    const parsed = parseUrlRange(search.get('from'), search.get('to'))
    if (parsed.isValid && parsed.hadParams) {
      return { from: parsed.from, to: parsed.to, activePreset: null }
    }
    // No URL params (default-30d landing) or malformed URL — fall back to
    // the stable default range. The mount effect below rewrites the URL.
    return { ...defaultRangeRef.current, activePreset: '30d' }
  })

  // Multi-line filter state. Seeded once at mount: explicit `locations`/`stockTypes`
  // URL params win; absent → fall back to legacy single-value `locationId`/`stockType`
  // from the URL (the "pre-selected" R4 case from the stock list / future deep links);
  // absent again → 'all'. Single-line entries skip the legacy seed entirely since the
  // filters aren't shown there.
  const [selectedLocations, setSelectedLocations] = useState<FilterSelection>(() =>
    parseFilterParam(
      search.get('locations'),
      hasSingleLineFilters ? null : search.get('locationId'),
    ),
  )
  const [selectedStockTypes, setSelectedStockTypes] = useState<FilterSelection>(() =>
    parseFilterParam(
      search.get('stockTypes'),
      hasSingleLineFilters ? null : search.get('stockType'),
    ),
  )

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

  // On mount, if the URL has no range params OR carries malformed values,
  // push the default 30d range into the URL so the address bar always
  // reflects the active filter. Rewriting on invalid input also stops a
  // bad shared link from looping 4xx responses through TanStack's retry.
  useEffect(() => {
    const parsed = parseUrlRange(search.get('from'), search.get('to'))
    if (!parsed.hadParams || !parsed.isValid) {
      writeRangeToUrl(defaultRangeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external URL changes (browser back/forward, deep-link nav while on
  // this page) into range state. Our own writeRangeToUrl calls also fire
  // this effect, but the equality short-circuit makes them no-ops. Invalid
  // URL params reset to the default and rewrite the URL — same defense as
  // the mount effect for navigation that lands on a malformed link.
  useEffect(() => {
    const parsed = parseUrlRange(search.get('from'), search.get('to'))
    if (!parsed.isValid) {
      setRange((prev) => {
        if (
          prev.from === defaultRangeRef.current.from &&
          prev.to === defaultRangeRef.current.to
        ) {
          return prev
        }
        return { ...defaultRangeRef.current, activePreset: '30d' }
      })
      writeRangeToUrl(defaultRangeRef.current)
      return
    }
    setRange((prev) => {
      if (prev.from === parsed.from && prev.to === parsed.to) return prev
      if (!parsed.hadParams) {
        if (
          prev.from === defaultRangeRef.current.from &&
          prev.to === defaultRangeRef.current.to
        ) {
          return prev
        }
        return { ...defaultRangeRef.current, activePreset: '30d' }
      }
      return { from: parsed.from, to: parsed.to, activePreset: null }
    })
  }, [search, writeRangeToUrl])

  // Sync external URL changes for the multi-select filters back into state.
  // After mount, the URL is the single source of truth for filter state —
  // the legacy `locationId`/`stockType` fallback only fires at first render.
  useEffect(() => {
    const nextLocations = parseFilterParam(search.get('locations'), null)
    const nextStockTypes = parseFilterParam(search.get('stockTypes'), null)
    setSelectedLocations((prev) => (selectionsEqual(prev, nextLocations) ? prev : nextLocations))
    setSelectedStockTypes((prev) =>
      selectionsEqual(prev, nextStockTypes) ? prev : nextStockTypes,
    )
  }, [search])

  const writeFilterToUrl = useCallback(
    (paramKey: 'locations' | 'stockTypes', selection: FilterSelection) => {
      const params = new URLSearchParams(search.toString())
      const value = selectionToParam(selection)
      if (value === null) params.delete(paramKey)
      else params.set(paramKey, value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, search],
  )

  const handleLocationsChange = useCallback(
    (next: FilterSelection) => {
      setSelectedLocations(next)
      writeFilterToUrl('locations', next)
    },
    [writeFilterToUrl],
  )

  const handleStockTypesChange = useCallback(
    (next: FilterSelection) => {
      setSelectedStockTypes(next)
      writeFilterToUrl('stockTypes', next)
    },
    [writeFilterToUrl],
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

  // Table behaviour is intentionally unchanged: it always reflects the URL
  // params (variantId / productId / locationId / stockType) and is unaffected
  // by the multi-select chart filters (R6 non-goal).
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

  // In multi-line mode the chart drops `locationId`/`stockType` from the API
  // call so it can populate the filter dropdowns from the full product
  // dataset; the URL's legacy single-value params only seed the dropdown
  // selection at mount. Single-line mode keeps the trio in the fetch.
  // Chart fetches the LATEST CHART_PER_PAGE rows in the range (sortDir desc).
  // The chart component sorts asc internally for left-to-right rendering.
  // When the range exceeds CHART_PER_PAGE, we drop the oldest tail rather
  // than the most-recent head — and a partial-data notice is rendered.
  const chartFilters = useMemo(
    () => ({
      variantId,
      productId,
      locationId: hasSingleLineFilters ? locationId : undefined,
      stockType: hasSingleLineFilters ? stockType : undefined,
      from: range.from,
      to: range.to,
      page: 1,
      perPage: CHART_PER_PAGE,
      sortDir: 'desc' as const,
    }),
    [variantId, productId, locationId, stockType, hasSingleLineFilters, range.from, range.to],
  )

  const { data: tableData, isLoading: tableLoading } = useStockMovements(tableFilters)
  const { data: chartData } = useStockMovements(chartFilters)

  const hasChart = hasSingleLineFilters || isProductMode
  const chartRows = chartData?.data ?? []
  const chartTotal = chartData?.meta.total ?? 0
  const isChartTruncated = chartTotal > chartRows.length
  const hasRange = Boolean(range.from || range.to)
  const chartEmptyTitle = hasRange ? t('chart.emptyRange.title') : t('chart.empty.title')
  const chartEmptyDescription = hasRange
    ? t('chart.emptyRange.description')
    : t('chart.empty.description')

  // In product mode, fan the flat row payload out into one series per
  // (location, stockType) combo. The composite key is locationId+stockType so
  // two stock types in the same warehouse become two series; locationName +
  // stockType form the human-readable label rendered in the legend.
  const productSeries = useMemo<StockMovementSeries[]>(() => {
    if (!isProductMode) return []
    const groups = new Map<string, StockMovementSeries>()
    for (const row of chartRows) {
      const key = `${row.locationId}|${row.stockType}`
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          name: t('chart.multiLine.seriesLabel', {
            location: row.locationName,
            stockType: row.stockType,
          }),
          rows: [],
        }
        groups.set(key, group)
      }
      group.rows.push(row)
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [isProductMode, chartRows, t])

  const locationOptions = useMemo<FilterOption[]>(() => {
    if (!isProductMode) return []
    const map = new Map<string, string>()
    for (const row of chartRows) {
      if (!map.has(row.locationId)) map.set(row.locationId, row.locationName)
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [isProductMode, chartRows])

  const stockTypeOptions = useMemo<FilterOption[]>(() => {
    if (!isProductMode) return []
    const set = new Set<string>()
    for (const row of chartRows) set.add(row.stockType)
    return Array.from(set)
      .map((v) => ({ value: v, label: v }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [isProductMode, chartRows])

  const filteredSeries = useMemo<StockMovementSeries[]>(() => {
    if (!isProductMode) return productSeries
    return productSeries.filter((s) => {
      const sepIdx = s.key.indexOf('|')
      const locId = sepIdx >= 0 ? s.key.slice(0, sepIdx) : s.key
      const sType = sepIdx >= 0 ? s.key.slice(sepIdx + 1) : ''
      const locOk = selectedLocations === 'all' || selectedLocations.has(locId)
      const typeOk = selectedStockTypes === 'all' || selectedStockTypes.has(sType)
      return locOk && typeOk
    })
  }, [isProductMode, productSeries, selectedLocations, selectedStockTypes])

  const noFilterSelected =
    isProductMode &&
    ((selectedLocations !== 'all' && selectedLocations.size === 0) ||
      (selectedStockTypes !== 'all' && selectedStockTypes.size === 0))

  const fromInputValue = isoToDateInput(range.from)
  const toInputValue = isoToDateInput(range.to)

  // Drive the chart's tick granularity from the user-selected window, not
  // the spread of the returned data points. Same-day movements inside a
  // 30d preset still need DD.MM. ticks; only a custom ≤24h window collapses
  // to HH:mm-only.
  const selectedRangeMs = useMemo(() => {
    if (!range.from || !range.to) return undefined
    return new Date(range.to).getTime() - new Date(range.from).getTime()
  }, [range.from, range.to])

  return (
    <div>
      <div className="sticky top-0 z-20 bg-background">
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

        <PageHeader title={t('title')} noSticky />
      </div>

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

          {isProductMode && (
            <div className="mb-3">
              <MovementFilters
                locationOptions={locationOptions}
                stockTypeOptions={stockTypeOptions}
                selectedLocations={selectedLocations}
                selectedStockTypes={selectedStockTypes}
                onLocationsChange={handleLocationsChange}
                onStockTypesChange={handleStockTypesChange}
              />
            </div>
          )}

          {hasChart ? (
            <>
              {isProductMode && (
                <div className="mb-2">
                  <p className="text-sm font-medium text-foreground">
                    {t('chart.multiLine.title')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('chart.multiLine.description')} {t('chart.multiLine.legendToggleHint')}
                  </p>
                </div>
              )}
              {isChartTruncated && (
                <p
                  role="status"
                  className="mb-2 text-xs text-amber-700 dark:text-amber-400"
                >
                  {t('chart.truncatedNotice', {
                    shown: chartRows.length,
                    total: chartTotal,
                  })}
                </p>
              )}
              {noFilterSelected ? (
                <div className="rounded-md border border-border h-64 flex flex-col items-center justify-center text-center px-6">
                  <p className="text-sm font-medium text-foreground">
                    {t('chart.noFilterSelected.title')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('chart.noFilterSelected.description')}
                  </p>
                </div>
              ) : isProductMode ? (
                <StockMovementChart
                  series={filteredSeries}
                  emptyTitle={chartEmptyTitle}
                  emptyDescription={chartEmptyDescription}
                  selectedRangeMs={selectedRangeMs}
                />
              ) : (
                <StockMovementChart
                  movements={chartRows}
                  emptyTitle={chartEmptyTitle}
                  emptyDescription={chartEmptyDescription}
                  selectedRangeMs={selectedRangeMs}
                />
              )}
            </>
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
