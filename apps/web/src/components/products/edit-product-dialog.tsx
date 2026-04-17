'use client'

import { zodResolver } from '@hookform/resolvers/zod'
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

const UNIT_OPTIONS = [
  { value: 'piece', label: 'Piece' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'liter', label: 'Liter' },
  { value: 'box', label: 'Box' },
  { value: 'pallet', label: 'Pallet' },
]

const editProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(500),
  barcode: z.string().min(1, 'EAN / Barcode is required').max(255),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().default(false),
  description: z.string().optional(),
  category: z.string().optional(),
})

type EditProductFormValues = z.infer<typeof editProductSchema>

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

  // Pre-fill the form whenever the selected product changes.
  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        // Barcode is not yet returned by GET /products — user re-enters on edit.
        // NOTE: The PATCH /products/:id endpoint does not accept barcode either;
        // edits to this field are discarded silently until the backend is extended.
        barcode: '',
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
        unit: values.unit,
        batchTracking: values.batchTracking,
        description: values.description?.trim() || undefined,
        category: values.category?.trim() || undefined,
        // barcode is intentionally omitted — PATCH /products does not accept it
      })
      toast({ title: 'Product updated', description: values.name })
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update product'
      toast({ title: 'Update failed', description: message, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="edit-name" className="mb-1 block">
              Product name <span className="text-red-500">*</span>
            </Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name ? <p className="text-xs text-red-600 mt-1">{errors.name.message}</p> : null}
          </div>

          <div>
            <Label htmlFor="edit-barcode" className="mb-1 block">
              EAN / Barcode <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-barcode"
              placeholder="e.g. 4006381333931"
              className="font-mono"
              {...register('barcode')}
            />
            {errors.barcode ? (
              <p className="text-xs text-red-600 mt-1">{errors.barcode.message}</p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-1">
              Barcode changes are not persisted yet — coming in a later update.
            </p>
          </div>

          <div>
            <Label className="mb-1 block">Unit</Label>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-1 block">Batch / expiry tracking</Label>
              <p className="text-xs text-muted-foreground">
                Track stock per batch with expiry dates.
              </p>
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
              Category
            </Label>
            <Input id="edit-category" placeholder="Optional" {...register('category')} />
          </div>

          <div>
            <Label htmlFor="edit-description" className="mb-1 block">
              Description
            </Label>
            <Textarea id="edit-description" placeholder="Optional" {...register('description')} />
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
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
