'use client'

import { formatDistanceToNow } from 'date-fns'
import { de as deLocale } from 'date-fns/locale'
import { BarChart3, CheckCircle2, ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { EditProductDialog } from '@/components/products/edit-product-dialog'
import { ProductBatchList } from '@/components/products/product-batch-list'
import { ProductSourceIcons } from '@/components/products/product-source-icons'
import { ProductStockTable } from '@/components/products/product-stock-table'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import { useDeleteProduct, useProduct } from '@/lib/api/use-products'
import { cn } from '@/lib/utils'

export default function ProductDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const t = useTranslations('products')
  const tDetail = useTranslations('products.detail')
  const tUnits = useTranslations('products.units')
  const tCommon = useTranslations('common')
  const tStock = useTranslations('stock')
  const locale = useLocale()
  const dateLocale = locale === 'de' ? deLocale : undefined

  const [editOpen, setEditOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  const { data: product, isLoading, error } = useProduct(id)
  const del = useDeleteProduct()

  // Default-select the first variant once the product loads. Single-variant
  // products effectively pin to that one variant; multi-variant products
  // start on the first row and let the operator click another to swap.
  const firstVariantId = product?.variants[0]?.id
  useEffect(() => {
    if (!firstVariantId) return
    setSelectedVariantId((current) => current ?? firstVariantId)
  }, [firstVariantId])

  async function handleDelete(): Promise<void> {
    if (!product) return
    try {
      await del.mutateAsync(product.id)
      toast({ title: tDetail('deleteConfirmTitle'), description: product.name })
      router.push('/products')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : tDetail('deleteConfirmDescription')
      toast({
        title: tDetail('deleteConfirmTitle'),
        description: message,
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-6 md:px-8 py-6">
          <div className="h-5 w-48 bg-muted animate-pulse rounded" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="px-6 md:px-8 py-16 text-center">
          <p className="text-sm text-muted-foreground">{tDetail('notFound')}</p>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 mt-4 text-sm text-brand-700 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('title')}
          </Link>
        </div>
      </div>
    )
  }

  const unitLabel = tryUnitLabel(tUnits, product.unit)
  const productSource = readSourceFromMetadata(product.metadata)

  return (
    <div>
      <div className="sticky top-0 z-20 h-12 border-b border-border bg-background px-6 md:px-8 flex items-center gap-2 text-sm">
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('title')}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium truncate">{product.name}</span>
      </div>

      <div className="px-6 md:px-8 py-5 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">{product.name}</h1>
            {product.description ? (
              <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditOpen(true)
              }}
            >
              <Pencil className="h-4 w-4" />
              {tCommon('edit')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteConfirmOpen(true)
              }}
            >
              <Trash2 className="h-4 w-4" />
              {tCommon('delete')}
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4">
          <MetaItem label={t('columns.unit')}>
            <span className="text-sm">{unitLabel}</span>
          </MetaItem>
          <MetaItem label={t('form.batchTracking')}>
            {product.batchTracking ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tDetail('batchTrackingOn')}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{tDetail('batchTrackingOff')}</span>
            )}
          </MetaItem>
        </dl>

        <p className="text-xs text-muted-foreground mt-4">
          {tDetail('createdRelative', {
            when: formatDistanceToNow(new Date(product.createdAt), {
              addSuffix: true,
              ...(dateLocale ? { locale: dateLocale } : {}),
            }),
          })}
        </p>
      </div>

      <section className="px-6 md:px-8 py-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">{tDetail('variantsTitle')}</h2>
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('columns.sku')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('columns.name')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('columns.barcode')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('columns.source')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tDetail('variantStatus')}
                </th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => {
                const isSelected = selectedVariantId === v.id
                // The active variant is always highlighted, even on single-variant
                // products — the highlight signals "this is the row driving the
                // stock table / Bewegungen-link below". Multi-variant products
                // additionally make rows clickable so the operator can swap; on
                // a single-variant product, the lone row stays pinned.
                const isClickable = product.variants.length > 1
                return (
                  <tr
                    key={v.id}
                    aria-selected={isSelected}
                    {...(isClickable
                      ? {
                          onClick: () => {
                            setSelectedVariantId(v.id)
                          },
                          onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedVariantId(v.id)
                            }
                          },
                          tabIndex: 0,
                          role: 'button',
                        }
                      : {})}
                    className={cn(
                      'border-b border-border last:border-b-0 transition-colors',
                      isClickable &&
                        'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      // Borders on <tr> are dropped under border-collapse: collapse (Tailwind preflight),
                      // so the selected-row left rail uses an inset box-shadow that paints reliably.
                      isSelected &&
                        'bg-blue-50 hover:bg-blue-50 shadow-[inset_4px_0_0_0_theme(colors.blue.500)]',
                    )}
                  >
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs">{v.sku}</span>
                    </td>
                    <td className="px-4 py-2">
                      {v.name ? (
                        <span className="text-sm">{v.name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {tDetail('defaultVariant')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {v.barcode ? (
                        <span className="font-mono text-xs">{v.barcode}</span>
                      ) : (
                        <EmDash />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <ProductSourceIcons source={productSource} />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          v.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {v.isActive ? tDetail('active') : tDetail('inactive')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="px-6 md:px-8 py-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            {tDetail('stockTitle')}
          </h2>
          <Button asChild variant="outline" size="sm">
            <Link
              href={
                selectedVariantId
                  ? `/stock/movements?productId=${id}&variantId=${selectedVariantId}`
                  : `/stock/movements?productId=${id}`
              }
            >
              <BarChart3 className="h-4 w-4" />
              {tStock('viewMovements')}
            </Link>
          </Button>
        </div>
        <ProductStockTable productId={id} variantId={selectedVariantId ?? undefined} />
      </section>

      {product.batchTracking ? (
        <section className="px-6 md:px-8 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {tDetail('batchListTitle')}
          </h2>
          <ProductBatchList productId={id} variantId={selectedVariantId ?? undefined} />
        </section>
      ) : null}

      <section className="px-6 md:px-8 py-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          {tDetail('integrationsTitle')}
        </h2>
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tDetail('integrationName')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tDetail('integrationType')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tDetail('integrationStatus')}
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tDetail('integrationExternalId')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {tDetail('integrationsEmpty')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <EditProductDialog
        product={product}
        open={editOpen}
        onOpenChange={setEditOpen}
        isIdentityLocked={deriveIsIdentityLocked(product)}
        hasExternalReferences={product.hasExternalReferences}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tDetail('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{tDetail('deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false)
              }}
              disabled={del.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleDelete()
              }}
              disabled={del.isPending}
            >
              {del.isPending ? tCommon('deleting') : tDetail('deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MetaItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function EmDash(): JSX.Element {
  return <span className="text-xs text-muted-foreground">—</span>
}

// next-intl throws on missing keys; if a product comes back with a non-standard
// unit (e.g. one imported via CSV), fall back to the raw string instead of
// crashing the detail page.
function tryUnitLabel(t: (key: string) => string, unit: string): string {
  try {
    return t(unit)
  } catch {
    return unit
  }
}

function readSourceFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const raw = metadata?.['source']
  return typeof raw === 'string' ? raw : null
}

// SKU and barcode must be immutable when either (a) the product is linked to
// an external integration, or (b) it came in via an automated import pipeline
// that owns identity (sftp/ftp sync today; more added as they ship). CSV
// imports are NOT locked — the user uploaded the file themselves and should
// be able to correct identity fields after the fact.
const LOCKED_SOURCES = new Set(['sftp', 'ftp'])

function deriveIsIdentityLocked(product: {
  hasExternalReferences: boolean
  metadata: Record<string, unknown> | null | undefined
}): boolean {
  if (product.hasExternalReferences) return true
  const source = product.metadata?.['source']
  return typeof source === 'string' && LOCKED_SOURCES.has(source)
}
