'use client'

import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { AddProductDialog } from '@/components/products/add-product-dialog'
import { DeleteProductDialog } from '@/components/products/delete-product-dialog'
import { EditProductDialog } from '@/components/products/edit-product-dialog'
import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProducts, type ProductWithCount } from '@/lib/api/use-products'

export default function ProductsPage(): JSX.Element {
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [toEdit, setToEdit] = useState<ProductWithCount | null>(null)
  const [toDelete, setToDelete] = useState<ProductWithCount | null>(null)

  const { data: products = [], isLoading } = useProducts({
    search: search || undefined,
  })

  const columns: ColumnDef<ProductWithCount>[] = [
    {
      header: 'Product',
      accessor: (row) => (
        <Link href={`/products/${row.id}`} className="text-foreground hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      header: 'SKU',
      accessor: (row) => {
        const sku = row.variants[0]?.sku
        return sku ? (
          <span className="font-mono text-xs">{sku}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
    {
      header: 'EAN / Barcode',
      accessor: (row) => {
        const barcode = row.variants[0]?.barcode
        return barcode ? (
          <span className="font-mono text-xs">{barcode}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
    {
      header: 'Batch',
      accessor: (row) =>
        row.batchTracking ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { header: 'Unit', accessor: 'unit' },
    {
      header: 'Created',
      accessor: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      header: '',
      accessor: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Edit ${row.name}`}
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
            aria-label={`Delete ${row.name}`}
            onClick={() => {
              setToDelete(row)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      className: 'text-right w-20',
    },
  ]

  return (
    <div>
      <PageHeader title="Products">
        <Button
          size="sm"
          onClick={() => {
            setAddOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Add product
        </Button>
      </PageHeader>

      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Input
          placeholder="Search by name or SKU…"
          className="h-8 w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
        />
      </div>

      <DataTable
        columns={columns}
        data={products}
        isLoading={isLoading}
        emptyIcon={Package}
        emptyTitle="No products yet"
        emptyDescription="Create your first product or connect an integration to import them."
        rowKey={(row) => row.id}
      />

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditProductDialog
        product={toEdit}
        open={toEdit !== null}
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
    </div>
  )
}
