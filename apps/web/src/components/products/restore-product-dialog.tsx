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
import { useRestoreProduct } from '@/lib/api/use-products'

interface RestoreProductDialogProps {
  productId: string | null
  productName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RestoreProductDialog({
  productId,
  productName,
  open,
  onOpenChange,
}: RestoreProductDialogProps): JSX.Element {
  const t = useTranslations('products.restoreConfirm')
  const tCommon = useTranslations('common')
  const restore = useRestoreProduct()

  async function handleConfirm(): Promise<void> {
    if (!productId) return
    try {
      await restore.mutateAsync(productId)
      toast({ title: t('restored'), description: productName ?? '' })
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('restoreFailedGeneric')
      toast({ title: t('restoreFailed'), description: message, variant: 'destructive' })
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
            disabled={restore.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => {
              void handleConfirm()
            }}
            disabled={restore.isPending}
          >
            {restore.isPending ? t('restoring') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
