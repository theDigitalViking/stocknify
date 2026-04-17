'use client'

import { formatDistanceToNow } from 'date-fns'
import { MoreHorizontal, Package } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { QuantityCell } from '@/components/shared/quantity-cell'
import { ManualAdjustDialog } from '@/components/stock/manual-adjust-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLocations } from '@/lib/api/use-locations'
import { useStock, type StockRow } from '@/lib/api/use-stock'
import { useStockTypes } from '@/lib/api/use-stock-types'

export default function StockPage(): JSX.Element {
  const [search, setSearch] = useState('')
  const [stockType, setStockType] = useState<string>('all')
  const [locationId, setLocationId] = useState<string>('all')
  const [adjustRow, setAdjustRow] = useState<StockRow | null>(null)

  const filters = useMemo(
    () => ({
      search: search || undefined,
      stockType: stockType === 'all' ? undefined : stockType,
      locationId: locationId === 'all' ? undefined : locationId,
    }),
    [search, stockType, locationId],
  )

  const { data: stockData = [], isLoading } = useStock(filters)
  const { data: stockTypes = [] } = useStockTypes()
  const { data: locations = [] } = useLocations()

  function clearFilters(): void {
    setSearch('')
    setStockType('all')
    setLocationId('all')
  }

  const columns: ColumnDef<StockRow>[] = [
    {
      header: 'SKU',
      accessor: 'sku',
      className: 'font-mono text-xs text-muted-foreground',
    },
    { header: 'Product', accessor: 'productName' },
    { header: 'Location', accessor: 'locationName' },
    {
      header: 'Available',
      accessor: (row) => <QuantityCell quantity={row.quantities.available ?? 0} />,
      className: 'text-right',
    },
    {
      header: 'Physical',
      accessor: (row) => <QuantityCell quantity={row.quantities.physical ?? 0} />,
      className: 'text-right',
    },
    {
      header: 'Reserved',
      accessor: (row) => <QuantityCell quantity={row.quantities.reserved ?? 0} />,
      className: 'text-right',
    },
    {
      header: 'Last synced',
      accessor: (row) =>
        row.lastSyncedAt ? (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.lastSyncedAt), { addSuffix: true })}
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
            <DropdownMenuItem onSelect={() => { setAdjustRow(row) }}>
              Manual adjust
            </DropdownMenuItem>
            <DropdownMenuItem disabled>View movements</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'text-right w-12',
    },
  ]

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
          onChange={(e) => { setSearch(e.target.value) }}
        />

        <Select value={stockType} onValueChange={setStockType}>
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue placeholder="Stock type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock types</SelectItem>
            {stockTypes.map((st) => (
              <SelectItem key={st.key} value={st.key}>
                {st.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="h-8 w-[200px]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={stockData}
        isLoading={isLoading}
        emptyIcon={Package}
        emptyTitle="No inventory yet"
        emptyDescription="Connect an integration to start syncing stock data."
        rowKey={(row) => `${row.variantId}:${row.locationId}`}
      />

      <ManualAdjustDialog
        row={adjustRow}
        open={adjustRow !== null}
        onOpenChange={(open) => { if (!open) setAdjustRow(null) }}
      />
    </div>
  )
}
