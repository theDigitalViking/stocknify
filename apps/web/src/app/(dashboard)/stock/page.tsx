'use client'

import { formatDistanceToNow } from 'date-fns'
import { MoreHorizontal, Package } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { QuantityCell } from '@/components/shared/quantity-cell'
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
  const [search, setSearch] = useState('')
  const [selectedStockTypes, setSelectedStockTypes] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [adjustRow, setAdjustRow] = useState<StockRow | null>(null)

  // Search filter still goes to the backend; stock type and location are applied
  // client-side so multiple values of each can be combined.
  const filters = useMemo(
    () => ({
      search: search || undefined,
    }),
    [search],
  )

  const { data: stockData = [], isLoading } = useStock(filters)
  const { data: stockTypes = [] } = useStockTypes()
  const { data: locations = [] } = useLocations()

  // Flatten the API response into one row per (variant, location, stockType),
  // then apply the multi-select filters in memory.
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

  // Lookup aggregated row by (variant, location) for the manual-adjust dialog,
  // which edits all stock types for a single (variant, location) together.
  const aggregatedByKey = useMemo(() => {
    const m = new Map<string, StockRow>()
    for (const item of stockData) m.set(`${item.variantId}:${item.locationId}`, item)
    return m
  }, [stockData])

  const stockTypeColorByKey = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const st of stockTypes) m.set(st.key, st.color ?? null)
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
      header: 'SKU',
      accessor: (row) => <span className="font-mono text-xs">{row.sku}</span>,
    },
    { header: 'Product', accessor: 'productName' },
    {
      header: 'Location',
      accessor: (row) => <span className="text-sm">{row.locationName}</span>,
    },
    {
      header: 'Stock Type',
      accessor: (row) => (
        <StockTypeBadge stockType={row.stockType} color={stockTypeColorByKey.get(row.stockType)} />
      ),
    },
    {
      header: 'Quantity',
      accessor: (row) => <QuantityCell quantity={row.quantity} />,
      className: 'text-right tabular-nums',
    },
    {
      header: 'Last synced',
      accessor: (row) =>
        row.lastSyncedAt ? (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(row.lastSyncedAt, { addSuffix: true })}
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
              Manual adjust
            </DropdownMenuItem>
            <DropdownMenuItem disabled>View movements</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'text-right w-12',
    },
  ]

  const stockTypeFilterLabel =
    selectedStockTypes.length === 0
      ? 'Stock type'
      : selectedStockTypes.length === 1
        ? `${String(selectedStockTypes.length)} type`
        : `${String(selectedStockTypes.length)} types`

  const locationFilterLabel = (() => {
    if (selectedLocations.length === 0) return 'Location'
    if (selectedLocations.length === 1) {
      return (
        locations.find((loc) => loc.id === selectedLocations[0])?.name ??
        '1 location'
      )
    }
    return `${String(selectedLocations.length)} locations`
  })()

  return (
    <div>
      <PageHeader title="Inventory">
        <Button size="sm" variant="outline" disabled>
          Export
        </Button>
        <Button size="sm" disabled>
          Add product
        </Button>
      </PageHeader>

      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Input
          placeholder="Search SKU or product name…"
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
            <DropdownMenuLabel>Stock type</DropdownMenuLabel>
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
            <DropdownMenuLabel>Location</DropdownMenuLabel>
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
          Clear
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={flatRows}
        isLoading={isLoading}
        emptyIcon={Package}
        emptyTitle="No inventory yet"
        emptyDescription="Connect an integration to start syncing stock data."
        rowKey={(row) => row.id}
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
