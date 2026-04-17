'use client'

import { useTranslations } from 'next-intl'

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
import { useDeleteProduct } from '@/lib/api/use-products'

interface DeleteProductDialogProps {
  productId: string | null
  productName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteProductDialog({
  productId,
  productName,
  open,
  onOpenChange,
}: DeleteProductDialogProps): JSX.Element {
  const t = useTranslations('products.deleteConfirm')
  const tCommon = useTranslations('common')
  const del = useDeleteProduct()

  async function handleConfirm(): Promise<void> {
    if (!productId) return
    try {
      await del.mutateAsync(productId)
      toast({ title: t('deleted'), description: productName ?? '' })
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('deleteFailedGeneric')
      toast({ title: t('deleteFailed'), description: message, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: productName ?? '' })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={del.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void handleConfirm()
            }}
            disabled={del.isPending}
          >
            {del.isPending ? tCommon('deleting') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
