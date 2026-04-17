'use client'

import { zodResolver } from '@hookform/resolvers/zod'
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
import { useUpdateProduct, type ProductWithCount } from '@/lib/api/use-products'

const UNIT_KEYS = ['piece', 'kg', 'liter', 'box', 'pallet'] as const

const editProductSchema = z.object({
  name: z.string().min(1, 'nameRequired').max(500),
  barcode: z.string().min(1, 'barcodeRequired').max(255),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().default(false),
  description: z.string().optional(),
  category: z.string().optional(),
})

type EditProductFormValues = z.infer<typeof editProductSchema>
type FormError = 'nameRequired' | 'barcodeRequired'

interface EditProductDialogProps {
  product: ProductWithCount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditProductDialog({
  product,
  open,
  onOpenChange,
}: EditProductDialogProps): JSX.Element {
  const t = useTranslations('products.form')
  const tUnits = useTranslations('products.units')
  const tCommon = useTranslations('common')
  const update = useUpdateProduct()

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditProductFormValues>({
    resolver: zodResolver(editProductSchema),
    defaultValues: {
      name: '',
      barcode: '',
      unit: 'piece',
      batchTracking: false,
      description: '',
      category: '',
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
        category: product.category ?? '',
      })
    }
  }, [product, reset])

  async function onSubmit(values: EditProductFormValues): Promise<void> {
    if (!product) return
    try {
      await update.mutateAsync({
        id: product.id,
        name: values.name.trim(),
        barcode: values.barcode.trim(),
        unit: values.unit,
        batchTracking: values.batchTracking,
        description: values.description?.trim() || undefined,
        category: values.category?.trim() || undefined,
      })
      toast({ title: t('updated'), description: values.name })
      onOpenChange(false)
    } catch (err) {
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
            <Label htmlFor="edit-barcode" className="mb-1 block">
              {t('barcode')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-barcode"
              placeholder={t('barcodePlaceholder')}
              className="font-mono"
              {...register('barcode')}
            />
            {errors.barcode ? (
              <p className="text-xs text-red-600 mt-1">{t(errors.barcode.message as FormError)}</p>
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
            <Label htmlFor="edit-category" className="mb-1 block">
              {t('category')}
            </Label>
            <Input
              id="edit-category"
              placeholder={t('categoryPlaceholder')}
              {...register('category')}
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
