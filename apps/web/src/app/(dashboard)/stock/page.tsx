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
import { useLocations, useStorageLocations } from '@/lib/api/use-locations'
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
  storageLocationId: string | null
  storageLocationName: string | null
  batchId: string | null
  batchNumber: string | null
  expiryDate: string | null
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
  const [selectedStorageLocations, setSelectedStorageLocations] = useState<string[]>([])
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
  const { data: storageLocations = [] } = useStorageLocations()

  // Scope the bin dropdown to the currently-selected parent locations. With
  // no parent filter, show every bin across every location — otherwise we
  // offer bins the user cannot reach given their other filters.
  const filteredStorageLocations = useMemo(() => {
    if (selectedLocations.length === 0) return storageLocations
    return storageLocations.filter((sl) => selectedLocations.includes(sl.locationId))
  }, [storageLocations, selectedLocations])

  const flatRows: FlatStockRow[] = useMemo(() => {
    const all = stockData.flatMap((item) =>
      Object.entries(item.quantities).map(([stockType, quantity]) => ({
        id: [
          item.variantId,
          item.locationId,
          item.storageLocationId ?? '-',
          item.batchId ?? '-',
          stockType,
        ].join(':'),
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        locationId: item.locationId,
        locationName: item.locationName,
        locationType: item.locationType,
        storageLocationId: item.storageLocationId,
        storageLocationName: item.storageLocationName,
        batchId: item.batchId,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
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
      // Bin filter is opt-in — when unset, bin-agnostic rows pass through.
      // When set, the row's `storageLocationId` must be non-null and one of
      // the selected ids. Rows without a bin are hidden in "show me just
      // these bins" mode because they can't satisfy the constraint.
      const matchesStorageLocation =
        selectedStorageLocations.length === 0 ||
        (row.storageLocationId !== null &&
          selectedStorageLocations.includes(row.storageLocationId))
      return matchesStockType && matchesLocation && matchesStorageLocation
    })
  }, [stockData, selectedStockTypes, selectedLocations, selectedStorageLocations])

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

  // Key must include every dimension that makes a stock row unique, so the
  // manual-adjust action opens the exact row the user clicked — not a
  // different row for the same (variant, location) pair in a different bin
  // or batch. With only `variantId:locationId`, rows split by storage
  // location or batch collapse into one map entry (last-write-wins) and the
  // action operates on a near-miss row.
  const aggregatedByKey = useMemo(() => {
    const m = new Map<string, StockRow>()
    for (const item of stockData) {
      const key = [
        item.variantId,
        item.locationId,
        item.storageLocationId ?? '-',
        item.batchId ?? '-',
      ].join(':')
      m.set(key, item)
    }
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
    setSelectedStorageLocations([])
  }

  const columns: ColumnDef<FlatStockRow>[] = [
    {
      header: t('columns.sku'),
      accessor: (row) => <span className="font-mono text-xs">{row.sku}</span>,
      sortField: 'sku',
    },
    { header: t('columns.product'), accessor: 'productName', sortField: 'productName' },
    {
      header: t('columns.warehouse'),
      accessor: (row) => <span className="text-sm">{row.locationName}</span>,
      sortField: 'locationName',
    },
    {
      header: t('columns.storageLocation'),
      accessor: (row) =>
        row.storageLocationName ? (
          <span className="text-sm">{row.storageLocationName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      sortField: 'storageLocationName',
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
                const key = [
                  row.variantId,
                  row.locationId,
                  row.storageLocationId ?? '-',
                  row.batchId ?? '-',
                ].join(':')
                const agg = aggregatedByKey.get(key)
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
    if (selectedLocations.length === 0) return t('filterWarehouse')
    if (selectedLocations.length === 1) {
      return (
        locations.find((loc) => loc.id === selectedLocations[0])?.name ??
        t('warehousesCount', { count: 1 })
      )
    }
    return t('warehousesCount', { count: selectedLocations.length })
  })()

  const storageLocationFilterLabel = (() => {
    if (selectedStorageLocations.length === 0) return t('filterStorageLocation')
    if (selectedStorageLocations.length === 1) {
      return (
        storageLocations.find((sl) => sl.id === selectedStorageLocations[0])?.name ??
        t('storageLocationsCount', { count: 1 })
      )
    }
    return t('storageLocationsCount', { count: selectedStorageLocations.length })
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
            <DropdownMenuLabel>{t('filterWarehouse')}</DropdownMenuLabel>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-[200px] justify-between">
              <span className="truncate">{storageLocationFilterLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px]">
            <DropdownMenuLabel>{t('filterStorageLocation')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {filteredStorageLocations.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t('noStorageLocations')}
              </div>
            ) : (
              filteredStorageLocations.map((sl) => {
                const isChecked = selectedStorageLocations.includes(sl.id)
                return (
                  <DropdownMenuCheckboxItem
                    key={sl.id}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      setSelectedStorageLocations((prev) =>
                        checked
                          ? [...new Set([...prev, sl.id])]
                          : prev.filter((x) => x !== sl.id),
                      )
                    }}
                    onSelect={(e) => {
                      e.preventDefault()
                    }}
                  >
                    {sl.name}
                  </DropdownMenuCheckboxItem>
                )
              })
            )}
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
