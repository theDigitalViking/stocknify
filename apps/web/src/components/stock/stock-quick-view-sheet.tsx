'use client'

import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ProductStockTable } from '@/components/products/product-stock-table'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useProduct } from '@/lib/api/use-products'

interface StockQuickViewSheetProps {
  productId: string | null
  onOpenChange: (open: boolean) => void
}

export function StockQuickViewSheet({
  productId,
  onOpenChange,
}: StockQuickViewSheetProps): JSX.Element {
  const open = productId !== null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col p-6 gap-0">
        {productId !== null ? (
          <QuickViewBody productId={productId} onOpenChange={onOpenChange} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function QuickViewBody({
  productId,
  onOpenChange,
}: {
  productId: string
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const t = useTranslations('stock.quickView')
  const tProducts = useTranslations('products')
  const tDetail = useTranslations('products.detail')
  const tUnits = useTranslations('products.units')

  const { data: product, isLoading, error } = useProduct(productId)

  const productName = product?.name
  const description = productName
    ? t('description', { productName })
    : t('descriptionLoading')

  const defaultVariant = product?.variants[0]
  const unitLabel = product ? tryUnitLabel(tUnits, product.unit) : null

  return (
    <>
      <SheetHeader className="pb-4 border-b border-border">
        <SheetTitle className="truncate">
          {product ? product.name : <Skeleton className="h-5 w-48" />}
        </SheetTitle>
        <SheetDescription>{description}</SheetDescription>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
          <MetaItem label={tProducts('columns.sku')}>
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : defaultVariant?.sku ? (
              <span className="font-mono text-xs">{defaultVariant.sku}</span>
            ) : (
              <EmDash />
            )}
          </MetaItem>
          <MetaItem label={tProducts('columns.barcode')}>
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : defaultVariant?.barcode ? (
              <span className="font-mono text-xs">{defaultVariant.barcode}</span>
            ) : (
              <EmDash />
            )}
          </MetaItem>
          <MetaItem label={tProducts('columns.unit')}>
            {isLoading ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <span className="text-sm">{unitLabel}</span>
            )}
          </MetaItem>
          <MetaItem label={tProducts('form.batchTracking')}>
            {isLoading ? (
              <Skeleton className="h-4 w-20" />
            ) : product?.batchTracking ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tDetail('batchTrackingOn')}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {tDetail('batchTrackingOff')}
              </span>
            )}
          </MetaItem>
        </dl>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto py-4">
        {error ? (
          <p className="text-sm text-muted-foreground">{t('errorLoadingProduct')}</p>
        ) : (
          <ProductStockTable productId={productId} />
        )}
      </div>

      <SheetFooter className="pt-4 border-t border-border">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/products/${productId}`}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('openProduct')}
          </Link>
        </Button>
      </SheetFooter>
    </>
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
// unit (e.g. one imported via CSV), fall back to the raw string.
function tryUnitLabel(t: (key: string) => string, unit: string): string {
  try {
    return t(unit)
  } catch {
    return unit
  }
}
