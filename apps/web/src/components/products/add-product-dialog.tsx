'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
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
import { useCreateProduct } from '@/lib/api/use-products'

const UNIT_KEYS = ['piece', 'kg', 'liter', 'box', 'pallet'] as const

const addProductSchema = z.object({
  name: z.string().min(1, 'nameRequired').max(500),
  sku: z.string().min(1, 'skuRequired').max(255),
  barcode: z.string().min(1, 'barcodeRequired').max(255),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().default(false),
  description: z.string().optional(),
})

type AddProductFormValues = z.infer<typeof addProductSchema>
type FormError = 'nameRequired' | 'skuRequired' | 'barcodeRequired'

interface AddProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps): JSX.Element {
  const t = useTranslations('products.form')
  const tUnits = useTranslations('products.units')
  const tCommon = useTranslations('common')
  const create = useCreateProduct()

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddProductFormValues>({
    resolver: zodResolver(addProductSchema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      unit: 'piece',
      batchTracking: false,
      description: '',
    },
  })

  async function onSubmit(values: AddProductFormValues): Promise<void> {
    try {
      await create.mutateAsync({
        name: values.name.trim(),
        sku: values.sku.trim(),
        barcode: values.barcode.trim(),
        unit: values.unit,
        batchTracking: values.batchTracking,
        description: values.description?.trim() || undefined,
      })
      toast({ title: t('created'), description: values.name })
      reset()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('createFailedGeneric')
      toast({ title: t('createFailed'), description: message, variant: 'destructive' })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="product-name" className="mb-1 block">
              {t('name')} <span className="text-red-500">*</span>
            </Label>
            <Input id="product-name" placeholder={t('namePlaceholder')} {...register('name')} />
            {errors.name ? (
              <p className="text-xs text-red-600 mt-1">{t(errors.name.message as FormError)}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="product-sku" className="mb-1 block">
              {t('sku')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-sku"
              placeholder={t('skuPlaceholder')}
              className="font-mono"
              {...register('sku')}
            />
            {errors.sku ? (
              <p className="text-xs text-red-600 mt-1">{t(errors.sku.message as FormError)}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="barcode" className="mb-1 block">
              {t('barcode')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="barcode"
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
            <Label htmlFor="product-description" className="mb-1 block">
              {t('description')}
            </Label>
            <Textarea
              id="product-description"
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
              {isSubmitting ? t('creating') : t('submitCreate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
