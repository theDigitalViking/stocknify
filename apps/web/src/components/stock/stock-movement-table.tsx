'use client'

import { ArrowDown, ArrowUp, History, Minus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import type { StockMovementRow } from '@/lib/api/use-stock-movements'
import { cn } from '@/lib/utils'

interface StockMovementTableProps {
  rows: StockMovementRow[]
  total: number
  page: number
  perPage: number
  sortDir: 'asc' | 'desc'
  isLoading: boolean
  onPageChange: (page: number) => void
  onSortToggle: () => void
}

export function StockMovementTable({
  rows,
  total,
  page,
  perPage,
  sortDir,
  isLoading,
  onPageChange,
  onSortToggle,
}: StockMovementTableProps): JSX.Element {
  const t = useTranslations('stockMovements')
  const locale = useLocale()

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const columns: ColumnDef<StockMovementRow>[] = [
    {
      header: (
        <button
          type="button"
          onClick={onSortToggle}
          className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {t('columns.date')}
          {sortDir === 'desc' ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )}
        </button>
      ),
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString(locale)}
        </span>
      ),
    },
    {
      header: t('columns.product'),
      accessor: (row) => <span className="text-sm">{row.productName}</span>,
    },
    {
      header: t('columns.variant'),
      accessor: (row) => <span className="font-mono text-xs">{row.variantSku}</span>,
    },
    {
      header: t('columns.location'),
      accessor: (row) => <span className="text-sm">{row.locationName}</span>,
    },
    {
      header: t('columns.stockType'),
      accessor: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          {row.stockType}
        </span>
      ),
    },
    {
      header: t('columns.quantity'),
      accessor: (row) => (
        <span className="text-sm tabular-nums">{row.quantity}</span>
      ),
      className: 'text-right tabular-nums',
    },
    {
      header: t('columns.delta'),
      accessor: (row) => <DeltaCell delta={row.delta} />,
      className: 'text-right tabular-nums',
    },
    {
      header: t('columns.source'),
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">{row.movementType}</span>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyIcon={History}
          emptyTitle={t('table.empty.title')}
          emptyDescription={t('table.empty.description')}
          rowKey={(row) => row.id}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t('pagination.showing', {
            from: total === 0 ? 0 : (page - 1) * perPage + 1,
            to: Math.min(page * perPage, total),
            total,
          })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onPageChange(page - 1)
            }}
            disabled={page <= 1 || isLoading}
          >
            {t('pagination.previous')}
          </Button>
          <span>
            {t('pagination.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onPageChange(page + 1)
            }}
            disabled={page >= totalPages || isLoading}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DeltaCell({ delta }: { delta: number }): JSX.Element {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
        <Minus className="h-3 w-3" />0
      </span>
    )
  }
  const isPositive = delta > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        isPositive ? 'text-green-600' : 'text-red-600',
      )}
    >
      {isPositive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {isPositive ? `+${String(delta)}` : String(delta)}
    </span>
  )
}
