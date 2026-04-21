'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { CheckCircle2, Package, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { AddProductDialog } from '@/components/products/add-product-dialog'
import { BulkDeleteDialog } from '@/components/products/bulk-delete-dialog'
import { DeleteProductDialog } from '@/components/products/delete-product-dialog'
import { EditProductDialog } from '@/components/products/edit-product-dialog'
import { ProductSourceIcons } from '@/components/products/product-source-icons'
import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import type { SortDir } from '@/components/shared/sortable-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import {
  useDeleteProducts,
  useProducts,
  type ProductWithCount,
} from '@/lib/api/use-products'
import { cn } from '@/lib/utils'

const UNIT_KEYS = ['piece', 'kg', 'liter', 'box', 'pallet'] as const
type UnitKey = (typeof UNIT_KEYS)[number]

function isKnownUnit(value: string): value is UnitKey {
  return (UNIT_KEYS as readonly string[]).includes(value)
}

function deriveSourceLockedFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const source = metadata?.['source']
  return typeof source === 'string' && source !== 'manual'
}

export default function ProductsPage(): JSX.Element {
  const t = useTranslations('products')
  const tUnits = useTranslations('products.units')
  const tBulk = useTranslations('products.bulk')
  const locale = useLocale()
  const dateLocale = locale === 'de' ? deLocale : undefined

  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [toEdit, setToEdit] = useState<ProductWithCount | null>(null)
  const [toDelete, setToDelete] = useState<ProductWithCount | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const { data: products = [], isLoading } = useProducts({
    search: search || undefined,
    sortBy: sortField ?? undefined,
    sortDir: sortDir ?? undefined,
    showDeleted: showDeleted || undefined,
  })
  const deleteMany = useDeleteProducts()

  // Backend does not yet honour sortBy/sortDir — the params are forwarded so
  // a future server-side implementation works transparently, but today we
  // sort client-side so the UI actually reflects the user's selection.
  const sortedProducts = useMemo(() => {
    if (!sortField || !sortDir) return products
    const getValue = (row: ProductWithCount): string => {
      switch (sortField) {
        case 'name':
          return row.name
        case 'sku':
          return row.variants[0]?.sku ?? ''
        case 'barcode':
          return row.variants[0]?.barcode ?? ''
        case 'createdAt':
          return row.createdAt
        default:
          return ''
      }
    }
    const copy = [...products]
    copy.sort((a, b) => {
      const cmp = getValue(a).localeCompare(getValue(b), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [products, sortField, sortDir])

  function handleSort(field: string | null, dir: SortDir): void {
    setSortField(field)
    setSortDir(dir)
  }

  const allSelected = sortedProducts.length > 0 && selectedIds.size === sortedProducts.length
  const someSelected = selectedIds.size > 0 && !allSelected

  function toggleAll(checked: boolean): void {
    if (checked) {
      setSelectedIds(new Set(sortedProducts.map((p) => p.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  function toggleOne(id: string, checked: boolean): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function confirmBulkDelete(): Promise<void> {
    const ids = Array.from(selectedIds)
    try {
      await deleteMany.mutateAsync(ids)
      toast({
        title: tBulk('deletedTitle'),
        description: tBulk('deletedDescription', { count: ids.length }),
      })
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : tBulk('deleteFailedGeneric')
      toast({
        title: tBulk('deleteFailedTitle'),
        description: message,
        variant: 'destructive',
      })
    }
  }

  const baseColumns: ColumnDef<ProductWithCount>[] = [
    {
      header: (
        <input
          type="checkbox"
          aria-label={tBulk('selectAll')}
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected
          }}
          onChange={(e) => {
            toggleAll(e.target.checked)
          }}
          className="h-4 w-4 rounded border-border cursor-pointer accent-brand-600"
        />
      ),
      accessor: (row) => (
        <input
          type="checkbox"
          aria-label={tBulk('selectRow', { name: row.name })}
          checked={selectedIds.has(row.id)}
          onChange={(e) => {
            toggleOne(row.id, e.target.checked)
          }}
          className="h-4 w-4 rounded border-border cursor-pointer accent-brand-600"
        />
      ),
      className: 'w-10',
    },
    {
      header: t('columns.name'),
      accessor: (row) => (
        <Link href={`/products/${row.id}`} className="text-foreground hover:underline">
          {row.name}
        </Link>
      ),
      sortField: 'name',
    },
    {
      header: t('columns.sku'),
      accessor: (row) => {
        const sku = row.variants[0]?.sku
        return sku ? (
          <span className="font-mono text-xs">{sku}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
      sortField: 'sku',
    },
    {
      header: t('columns.barcode'),
      accessor: (row) => {
        const barcode = row.variants[0]?.barcode
        return barcode ? (
          <span className="font-mono text-xs">{barcode}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
      sortField: 'barcode',
    },
    {
      header: t('columns.source'),
      accessor: (row) => <ProductSourceIcons metadata={row.metadata} />,
      className: 'w-16',
    },
    {
      header: t('columns.batch'),
      accessor: (row) =>
        row.batchTracking ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      header: t('columns.unit'),
      accessor: (row) => (
        <span className="text-sm text-muted-foreground">
          {isKnownUnit(row.unit) ? tUnits(row.unit) : row.unit}
        </span>
      ),
    },
    {
      header: t('columns.created'),
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.createdAt), {
            addSuffix: true,
            ...(dateLocale ? { locale: dateLocale } : {}),
          })}
        </span>
      ),
      sortField: 'createdAt',
    },
  ]

  const deletedColumns: ColumnDef<ProductWithCount>[] = [
    {
      header: t('deletedAt'),
      accessor: (row) =>
        row.deletedAt ? (
          <span className="text-xs text-muted-foreground">
            {format(new Date(row.deletedAt), 'dd.MM.yyyy', {
              ...(dateLocale ? { locale: dateLocale } : {}),
            })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      header: t('deletedBy'),
      accessor: (row) => {
        const u = row.deletedByUser
        if (!u) return <span className="text-xs text-muted-foreground">—</span>
        const label = u.fullName ?? u.email
        return <span className="text-xs text-muted-foreground">{label}</span>
      },
    },
  ]

  const actionsColumn: ColumnDef<ProductWithCount> = {
    header: '',
    accessor: (row) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`${t('form.editTitle')}: ${row.name}`}
          onClick={() => {
            setToEdit(row)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
          aria-label={`${t('deleteConfirm.confirm')}: ${row.name}`}
          onClick={() => {
            setToDelete(row)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
    className: 'text-right w-20',
  }

  // Deleted rows: swap the trailing action column for deletedAt + deletedBy.
  // Editing or re-deleting soft-deleted products does not make sense today, so
  // the per-row actions are simply omitted.
  const columns: ColumnDef<ProductWithCount>[] = showDeleted
    ? [...baseColumns, ...deletedColumns]
    : [...baseColumns, actionsColumn]

  return (
    <div>
      <PageHeader title={t('title')}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/products/import">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {t('importCsv')}
          </Link>
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setAddOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          {t('addProduct')}
        </Button>
      </PageHeader>

      {selectedIds.size > 0 ? (
        <div className="px-6 py-2 border-b border-border bg-accent flex items-center justify-between">
          <span className="text-sm text-foreground font-medium">
            {tBulk('selectedCount', { count: selectedIds.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedIds(new Set())
              }}
            >
              {tBulk('clearSelection')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setBulkDeleteOpen(true)
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {tBulk('deleteAction')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Input
          placeholder={t('searchPlaceholder')}
          className="h-8 w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
        />
        <button
          type="button"
          onClick={() => {
            setShowDeleted((v) => !v)
            setSelectedIds(new Set())
          }}
          className={cn(
            'h-8 px-3 text-xs rounded-md border transition-colors',
            showDeleted
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {showDeleted ? t('showingDeleted') : t('showDeleted')}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={sortedProducts}
        isLoading={isLoading}
        emptyIcon={Package}
        emptyTitle={t('empty.title')}
        emptyDescription={t('empty.description')}
        rowKey={(row) => row.id}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
      />

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditProductDialog
        product={toEdit}
        open={toEdit !== null}
        // List-view rows don't carry hasExternalReferences — the list endpoint
        // doesn't return it. We can still lock on source-based criteria alone;
        // the backend enforces the external-reference rule authoritatively.
        isIdentityLocked={toEdit ? deriveSourceLockedFromMetadata(toEdit.metadata) : false}
        onOpenChange={(open) => {
          if (!open) setToEdit(null)
        }}
      />
      <DeleteProductDialog
        productId={toDelete?.id ?? null}
        productName={toDelete?.name ?? null}
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
      />
      <BulkDeleteDialog
        count={selectedIds.size}
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!deleteMany.isPending) setBulkDeleteOpen(open)
        }}
        onConfirm={() => {
          void confirmBulkDelete()
        }}
        isLoading={deleteMany.isPending}
      />
    </div>
  )
}
