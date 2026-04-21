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
  barcode: z.string().max(255).optional().default(''),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().default(false),
  description: z.string().optional(),
})

type EditProductFormValues = z.infer<typeof editProductSchema>
type FormError = 'nameRequired'

// Accept both the list-view shape (ProductWithCount — minimal variant fields)
// and the detail-view shape (ProductDetail). The dialog only reads fields that
// both types share, so structural typing handles the rest.
type EditableProduct = ProductWithCount | ProductDetail

interface EditProductDialogProps {
  product: EditableProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // When true, SKU + barcode are read-only and the UI surfaces a lock hint.
  // Only the detail page knows this — from the list view we pass undefined.
  hasExternalReferences?: boolean
}

export function EditProductDialog({
  product,
  open,
  onOpenChange,
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
        barcode: product.variants[0]?.barcode ?? '',
        unit: product.unit,
        batchTracking: product.batchTracking,
        description: product.description ?? '',
      })
    }
  }, [product, reset])

  async function onSubmit(values: EditProductFormValues): Promise<void> {
    if (!product) return
    try {
      await update.mutateAsync({
        id: product.id,
        name: values.name.trim(),
        // Barcode is locked when hasExternalReferences — do not send a change
        // even if the controlled input somehow produced one.
        ...(hasExternalReferences
          ? {}
          : { barcode: values.barcode.trim() }),
        unit: values.unit,
        batchTracking: values.batchTracking,
        description: values.description?.trim() || undefined,
      })
      toast({ title: t('updated'), description: values.name })
      onOpenChange(false)
    } catch (err) {
      // Special-case the batch-tracking guard so the UI can revert the switch
      // and show a targeted explanation instead of the generic failure toast.
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

  const sku = product?.variants[0]?.sku ?? ''

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
            <Label className="mb-1 block">{t('sku')}</Label>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{sku || '—'}</code>
              {hasExternalReferences ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {t('lockedByIntegration')}
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="edit-barcode" className="mb-1 block">
              {t('barcode')}
            </Label>
            <Input
              id="edit-barcode"
              placeholder={t('barcodePlaceholder')}
              className="font-mono"
              disabled={hasExternalReferences}
              {...register('barcode')}
            />
            {hasExternalReferences ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {t('barcodeLockedHelp')}
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
