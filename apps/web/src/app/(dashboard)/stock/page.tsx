'use client'

import { formatDistanceToNow } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { MoreHorizontal, Package, Upload } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { QuantityCell } from '@/components/shared/quantity-cell'
import type { SortDir } from '@/components/shared/sortable-header'
import { ManualAdjustDialog } from '@/components/stock/manual-adjust-dialog'
import { StockTypeBadge } from '@/components/stock/stock-type-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useLocations } from '@/lib/api/use-locations'
import { useStock, type StockRow } from '@/lib/api/use-stock'
import { useStockTypes } from '@/lib/api/use-stock-types'

interface FlatStockRow {
  id: string
  variantId: string
  sku: string
  productName: string
  locationId: string
  locationName: string
  locationType: string
  stockType: string
  quantity: number
  lastSyncedAt: Date | null
}

export default function StockPage(): JSX.Element {
  const t = useTranslations('stock')
  const locale = useLocale()
  const dateLocale = locale === 'de' ? deLocale : undefined

  const [search, setSearch] = useState('')
  const [selectedStockTypes, setSelectedStockTypes] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [adjustRow, setAdjustRow] = useState<StockRow | null>(null)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const filters = useMemo(
    () => ({
      search: search || undefined,
    }),
    [search],
  )

  const { data: stockData = [], isLoading } = useStock(filters)
  const { data: stockTypes = [] } = useStockTypes()
  const { data: locations = [] } = useLocations()

  const flatRows: FlatStockRow[] = useMemo(() => {
    const all = stockData.flatMap((item) =>
      Object.entries(item.quantities).map(([stockType, quantity]) => ({
        id: `${item.variantId}:${item.locationId}:${stockType}`,
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        locationId: item.locationId,
        locationName: item.locationName,
        locationType: item.locationType,
        stockType,
        quantity,
        lastSyncedAt: item.lastSyncedAt ? new Date(item.lastSyncedAt) : null,
      })),
    )
    return all.filter((row) => {
      const matchesStockType =
        selectedStockTypes.length === 0 || selectedStockTypes.includes(row.stockType)
      const matchesLocation =
        selectedLocations.length === 0 || selectedLocations.includes(row.locationId)
      return matchesStockType && matchesLocation
    })
  }, [stockData, selectedStockTypes, selectedLocations])

  const sortedRows = useMemo(() => {
    if (!sortField || !sortDir) return flatRows
    const copy = [...flatRows]
    copy.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField]
      const bVal = (b as unknown as Record<string, unknown>)[sortField]
      const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, {
        numeric: true,
      })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [flatRows, sortField, sortDir])

  const aggregatedByKey = useMemo(() => {
    const m = new Map<string, StockRow>()
    for (const item of stockData) m.set(`${item.variantId}:${item.locationId}`, item)
    return m
  }, [stockData])

  const stockTypeByKey = useMemo(() => {
    const m = new Map<string, { color: string | null; label: string }>()
    for (const st of stockTypes) m.set(st.key, { color: st.color ?? null, label: st.label })
    return m
  }, [stockTypes])

  function toggleStockType(key: string, checked: boolean): void {
    setSelectedStockTypes((prev) => {
      if (checked) return [...new Set([...prev, key])]
      return prev.filter((k) => k !== key)
    })
  }

  function toggleLocation(id: string, checked: boolean): void {
    setSelectedLocations((prev) => {
      if (checked) return [...new Set([...prev, id])]
      return prev.filter((x) => x !== id)
    })
  }

  function clearFilters(): void {
    setSearch('')
    setSelectedStockTypes([])
    setSelectedLocations([])
  }

  const columns: ColumnDef<FlatStockRow>[] = [
    {
      header: t('columns.sku'),
      accessor: (row) => <span className="font-mono text-xs">{row.sku}</span>,
      sortField: 'sku',
    },
    { header: t('columns.product'), accessor: 'productName', sortField: 'productName' },
    {
      header: t('columns.location'),
      accessor: (row) => <span className="text-sm">{row.locationName}</span>,
      sortField: 'locationName',
    },
    {
      header: t('columns.stockType'),
      accessor: (row) => {
        const meta = stockTypeByKey.get(row.stockType)
        return (
          <StockTypeBadge stockType={row.stockType} color={meta?.color} label={meta?.label} />
        )
      },
    },
    {
      header: t('columns.quantity'),
      accessor: (row) => <QuantityCell quantity={row.quantity} />,
      className: 'text-right tabular-nums',
      sortField: 'quantity',
    },
    {
      header: t('columns.lastSynced'),
      accessor: (row) =>
        row.lastSyncedAt ? (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(row.lastSyncedAt, {
              addSuffix: true,
              ...(dateLocale ? { locale: dateLocale } : {}),
            })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      header: '',
      accessor: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                const agg = aggregatedByKey.get(`${row.variantId}:${row.locationId}`)
                if (agg) setAdjustRow(agg)
              }}
            >
              {t('manualAdjust')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>{t('viewMovements')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'text-right w-12',
    },
  ]

  const stockTypeFilterLabel =
    selectedStockTypes.length === 0
      ? t('filterStockType')
      : t('typesCount', { count: selectedStockTypes.length })

  const locationFilterLabel = (() => {
    if (selectedLocations.length === 0) return t('filterLocation')
    if (selectedLocations.length === 1) {
      return (
        locations.find((loc) => loc.id === selectedLocations[0])?.name ??
        t('locationsCount', { count: 1 })
      )
    }
    return t('locationsCount', { count: selectedLocations.length })
  })()

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Input
          placeholder={t('searchPlaceholder')}
          className="h-8 w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-[160px] justify-between">
              <span>{stockTypeFilterLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuLabel>{t('filterStockType')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {stockTypes.map((st) => {
              const isChecked = selectedStockTypes.includes(st.key)
              return (
                <DropdownMenuCheckboxItem
                  key={st.key}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    toggleStockType(st.key, Boolean(checked))
                  }}
                  onSelect={(e) => {
                    e.preventDefault()
                  }}
                >
                  {st.label}
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-[200px] justify-between">
              <span className="truncate">{locationFilterLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px]">
            <DropdownMenuLabel>{t('filterLocation')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {locations.map((loc) => {
              const isChecked = selectedLocations.includes(loc.id)
              return (
                <DropdownMenuCheckboxItem
                  key={loc.id}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    toggleLocation(loc.id, Boolean(checked))
                  }}
                  onSelect={(e) => {
                    e.preventDefault()
                  }}
                >
                  {loc.name}
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" onClick={clearFilters}>
          {t('clearFilters')}
        </Button>

        <Button variant="outline" size="sm" className="h-8 gap-1.5 ml-auto" asChild>
          <Link href="/stock/import">
            <Upload className="h-3.5 w-3.5" />
            {t('importButton')}
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={sortedRows}
        isLoading={isLoading}
        emptyIcon={Package}
        emptyTitle={t('empty.title')}
        emptyDescription={t('empty.description')}
        rowKey={(row) => row.id}
        sortField={sortField}
        sortDir={sortDir}
        onSort={(field, dir) => {
          setSortField(field)
          setSortDir(dir)
        }}
      />

      <ManualAdjustDialog
        row={adjustRow}
        open={adjustRow !== null}
        onOpenChange={(open) => {
          if (!open) setAdjustRow(null)
        }}
      />
    </div>
  )
}
