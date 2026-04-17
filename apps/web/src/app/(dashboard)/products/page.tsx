'use client'

import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, MoreHorizontal, Package, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { AddProductDialog } from '@/components/products/add-product-dialog'
import { DeleteProductDialog } from '@/components/products/delete-product-dialog'
import { DataTable, type ColumnDef } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useProducts, type ProductWithCount } from '@/lib/api/use-products'

export default function ProductsPage(): JSX.Element {
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
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
      accessor: (row) =>
        row._count.variants === 1 ? (
          <span className="font-mono text-xs text-muted-foreground">
            {/* Single-variant SKU is not denormalized on Product — leave blank for now */}
            —
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Variants',
      accessor: (row) =>
        row._count.variants > 1 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {row._count.variants}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>Edit</DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onSelect={() => { setToDelete(row) }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'text-right w-12',
    },
  ]

  return (
    <div>
      <PageHeader title="Products">
        <Button size="sm" onClick={() => { setAddOpen(true) }}>
          <Plus className="h-4 w-4" />
          Add product
        </Button>
      </PageHeader>

      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Input
          placeholder="Search by name or SKU…"
          className="h-8 w-64"
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
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
      <DeleteProductDialog
        productId={toDelete?.id ?? null}
        productName={toDelete?.name ?? null}
        open={toDelete !== null}
        onOpenChange={(open) => { if (!open) setToDelete(null) }}
      />
    </div>
  )
}
