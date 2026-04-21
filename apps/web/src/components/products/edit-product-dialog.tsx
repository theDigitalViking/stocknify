'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { ApiError } from '@/lib/api/client'
import {
  useUpdateProduct,
  type ProductDetail,
  type ProductWithCount,
} from '@/lib/api/use-products'

const UNIT_KEYS = ['piece', 'kg', 'liter', 'box', 'pallet'] as const

const editProductSchema = z.object({
  name: z.string().min(1, 'nameRequired').max(500),
  sku: z.string().min(1, 'skuRequired').max(255),
  barcode: z.string().max(255).optional().default(''),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().default(false),
  description: z.string().optional(),
})

type EditProductFormValues = z.infer<typeof editProductSchema>
type FormError = 'nameRequired' | 'skuRequired'

// Accept both the list-view shape (ProductWithCount — minimal variant fields)
// and the detail-view shape (ProductDetail). The dialog only reads fields that
// both types share, so structural typing handles the rest.
type EditableProduct = ProductWithCount | ProductDetail

interface EditProductDialogProps {
  product: EditableProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // When true, SKU + barcode are read-only and surface a lock reason.
  // Callers compute this from both signals (external references + source).
  // The list view only has `metadata.source` available; the detail view
  // additionally knows about `hasExternalReferences`.
  isIdentityLocked?: boolean
  // Disambiguates the reason text when the lock fires. When truthy, the
  // lock was caused by an external-integration reference; otherwise the
  // lock reason falls back to the product's non-manual `metadata.source`.
  hasExternalReferences?: boolean
}

function readSource(product: EditableProduct | null): string | null {
  if (!product) return null
  const meta = product.metadata as Record<string, unknown> | null | undefined
  const source = meta?.['source']
  return typeof source === 'string' ? source : null
}

export function EditProductDialog({
  product,
  open,
  onOpenChange,
  isIdentityLocked = false,
  hasExternalReferences = false,
}: EditProductDialogProps): JSX.Element {
  const t = useTranslations('products.form')
  const tDetail = useTranslations('products.detail')
  const tUnits = useTranslations('products.units')
  const tCommon = useTranslations('common')
  const update = useUpdateProduct()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditProductFormValues>({
    resolver: zodResolver(editProductSchema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      unit: 'piece',
      batchTracking: false,
      description: '',
    },
  })

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        sku: product.variants[0]?.sku ?? '',
        barcode: product.variants[0]?.barcode ?? '',
        unit: product.unit,
        batchTracking: product.batchTracking,
        description: product.description ?? '',
      })
    }
  }, [product, reset])

  const source = readSource(product)
  const isSourceLocked = source !== null && source !== 'manual'
  // Source-based lock wins over external-reference lock for the reason text —
  // the source tells the user concretely where the record originated (CSV /
  // specific integration name), which is more actionable than a generic
  // "linked to an integration" message.
  const lockReason = isIdentityLocked
    ? isSourceLocked
      ? t('lockedBySource', { source: source ?? '' })
      : hasExternalReferences
        ? t('lockedByReference')
        : null
    : null

  async function onSubmit(values: EditProductFormValues): Promise<void> {
    if (!product) return
    try {
      await update.mutateAsync({
        id: product.id,
        name: values.name.trim(),
        // SKU + barcode are only sent when the identity fields are unlocked.
        // The backend enforces the same rule — this is defense in depth so a
        // stale client that somehow produced values still can't mutate them.
        ...(isIdentityLocked
          ? {}
          : {
              sku: values.sku.trim(),
              barcode: values.barcode?.trim() ?? '',
            }),
        unit: values.unit,
        batchTracking: values.batchTracking,
        description: values.description?.trim() || undefined,
      })
      toast({ title: t('updated'), description: values.name })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BATCH_STOCK_EXISTS') {
        setValue('batchTracking', product.batchTracking)
        toast({
          title: t('updateFailed'),
          description: tDetail('batchTrackingBlockedToast'),
          variant: 'destructive',
        })
        return
      }
      const message = err instanceof Error ? err.message : t('updateFailedGeneric')
      toast({ title: t('updateFailed'), description: message, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="edit-name" className="mb-1 block">
              {t('name')} <span className="text-red-500">*</span>
            </Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name ? (
              <p className="text-xs text-red-600 mt-1">{t(errors.name.message as FormError)}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="edit-sku" className="mb-1 block">
              {t('sku')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-sku"
              className="font-mono"
              disabled={isIdentityLocked}
              title={lockReason ?? undefined}
              {...register('sku')}
            />
            {errors.sku ? (
              <p className="text-xs text-red-600 mt-1">{t(errors.sku.message as FormError)}</p>
            ) : null}
            {isIdentityLocked && lockReason ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Lock className="h-3 w-3 flex-shrink-0" />
                <span>{lockReason}</span>
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="edit-barcode" className="mb-1 block">
              {t('barcode')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-barcode"
              placeholder={t('barcodePlaceholder')}
              className="font-mono"
              disabled={isIdentityLocked}
              title={lockReason ?? undefined}
              {...register('barcode')}
            />
            {isIdentityLocked && lockReason ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Lock className="h-3 w-3 flex-shrink-0" />
                <span>{lockReason}</span>
              </p>
            ) : null}
          </div>

          <div>
            <Label className="mb-1 block">{t('unit')}</Label>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_KEYS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {tUnits(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-1 block">{t('batchTracking')}</Label>
              <p className="text-xs text-muted-foreground">{t('batchTrackingHelp')}</p>
            </div>
            <Controller
              control={control}
              name="batchTracking"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <div>
            <Label htmlFor="edit-description" className="mb-1 block">
              {t('description')}
            </Label>
            <Textarea
              id="edit-description"
              placeholder={t('descriptionPlaceholder')}
              {...register('description')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
              }}
              disabled={isSubmitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? tCommon('saving') : tCommon('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
