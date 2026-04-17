'use client'

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
  const del = useDeleteProduct()

  async function handleConfirm(): Promise<void> {
    if (!productId) return
    try {
      await del.mutateAsync(productId)
      toast({ title: 'Product deleted', description: productName ?? '' })
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete product'
      toast({ title: 'Delete failed', description: message, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete product?</DialogTitle>
          <DialogDescription>
            This will soft-delete{productName ? ` "${productName}"` : ' this product'} and hide it
            from inventory. Stock data is preserved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false) }} disabled={del.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => { void handleConfirm() }} disabled={del.isPending}>
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
