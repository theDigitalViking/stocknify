'use client'

import { useTranslations } from 'next-intl'

import { QuantityCell } from '@/components/shared/quantity-cell'
import { StockTypeBadge } from '@/components/stock/stock-type-badge'
import { useStock } from '@/lib/api/use-stock'
import { useStockTypes } from '@/lib/api/use-stock-types'

interface ProductStockTableProps {
  productId: string
}

interface Row {
  key: string
  locationName: string
  storageLocationName: string | null
  stockType: string
  quantity: number
  batchNumber: string | null
}

// Product-scoped stock readout. Shows one row per
// (location × bin × batch × stockType) so every dimension is visible on the
// detail page, in contrast to the main stock page which also lists bins and
// batches separately but spans the whole tenant.
export function ProductStockTable({ productId }: ProductStockTableProps): JSX.Element {
  const t = useTranslations('products.detail')
  const { data: stockData = [], isLoading } = useStock({ productId })
  const { data: stockTypes = [] } = useStockTypes()

  const stockTypeByKey = new Map<string, { color: string | null; label: string }>()
  for (const st of stockTypes) {
    stockTypeByKey.set(st.key, { color: st.color ?? null, label: st.label })
  }

  const rows: Row[] = stockData.flatMap((item) =>
    Object.entries(item.quantities).map(([stockType, quantity]) => ({
      key: [
        item.variantId,
        item.locationId,
        item.storageLocationId ?? '-',
        item.batchId ?? '-',
        stockType,
      ].join(':'),
      locationName: item.locationName,
      storageLocationName: item.storageLocationName,
      stockType,
      quantity,
      batchNumber: item.batchNumber,
    })),
  )

  if (isLoading) {
    return <div className="h-12 bg-muted animate-pulse rounded" />
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('stockEmpty')}</p>
  }

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('stockWarehouse')}
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('stockStorageLocation')}
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('stockType')}
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('stockQuantity')}
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('stockBatch')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meta = stockTypeByKey.get(row.stockType)
            return (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 text-sm">{row.locationName}</td>
                <td className="px-4 py-2">
                  {row.storageLocationName ? (
                    <span className="text-sm">{row.storageLocationName}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <StockTypeBadge
                    stockType={row.stockType}
                    color={meta?.color}
                    label={meta?.label}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <QuantityCell quantity={row.quantity} />
                </td>
                <td className="px-4 py-2">
                  {row.batchNumber ? (
                    <span className="text-xs font-mono">{row.batchNumber}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
