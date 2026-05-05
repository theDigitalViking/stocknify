'use client'

import { useLocale, useTranslations } from 'next-intl'

import { QuantityCell } from '@/components/shared/quantity-cell'
import { StockTypeBadge } from '@/components/stock/stock-type-badge'
import { useStock } from '@/lib/api/use-stock'
import { useStockTypes } from '@/lib/api/use-stock-types'

interface ProductBatchListProps {
  productId: string
  // When set, only batches that hold stock for this variant are shown.
  variantId?: string
}

interface BatchRow {
  key: string
  batchNumber: string
  expiryDate: string | null
  locationName: string
  stockType: string
  quantity: number
}

export function ProductBatchList({
  productId,
  variantId,
}: ProductBatchListProps): JSX.Element {
  const t = useTranslations('products.batchList')
  const locale = useLocale()
  const { data: stockData = [], isLoading } = useStock({ productId, variantId })
  const { data: stockTypes = [] } = useStockTypes()

  const stockTypeByKey = new Map<string, { color: string | null; label: string }>()
  for (const st of stockTypes) {
    stockTypeByKey.set(st.key, { color: st.color ?? null, label: st.label })
  }

  const rows: BatchRow[] = stockData
    .filter((item) => item.batchId !== null && item.batchNumber !== null)
    .flatMap((item) =>
      Object.entries(item.quantities).map(([stockType, quantity]) => ({
        key: [item.batchId ?? '-', item.locationId, stockType].join(':'),
        batchNumber: item.batchNumber as string,
        expiryDate: item.expiryDate,
        locationName: item.locationName,
        stockType,
        quantity,
      })),
    )

  if (isLoading) {
    return <div className="h-12 bg-muted animate-pulse rounded" />
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>
  }

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('columns.batch')}
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('columns.expiryDate')}
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('columns.location')}
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('columns.quantity')}
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('columns.stockType')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meta = stockTypeByKey.get(row.stockType)
            return (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2">
                  <span className="text-xs font-mono">{row.batchNumber}</span>
                </td>
                <td className="px-4 py-2">
                  {row.expiryDate ? (
                    <span className="text-xs">
                      {new Date(row.expiryDate).toLocaleDateString(locale, {
                        timeZone: 'UTC',
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-sm">{row.locationName}</td>
                <td className="px-4 py-2 text-right">
                  <QuantityCell quantity={row.quantity} />
                </td>
                <td className="px-4 py-2">
                  <StockTypeBadge
                    stockType={row.stockType}
                    color={meta?.color}
                    label={meta?.label}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
