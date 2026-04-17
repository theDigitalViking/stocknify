'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { useUpsertStock, type StockRow } from '@/lib/api/use-stock'
import { useStockTypes } from '@/lib/api/use-stock-types'

interface ManualAdjustDialogProps {
  row: StockRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManualAdjustDialog({ row, open, onOpenChange }: ManualAdjustDialogProps): JSX.Element {
  const t = useTranslations('stock.adjust')
  const tCommon = useTranslations('common')
  const { data: stockTypes = [] } = useStockTypes()
  const upsert = useUpsertStock()
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (row) {
      const initial: Record<string, string> = {}
      for (const st of stockTypes) {
        initial[st.key] = String(row.quantities[st.key] ?? 0)
      }
      setQuantities(initial)
      setReason('')
    }
  }, [row, stockTypes])

  async function handleSubmit(): Promise<void> {
    if (!row) return

    const changes: Array<{ stockType: string; quantity: number }> = []
    for (const st of stockTypes) {
      const current = row.quantities[st.key] ?? 0
      const next = Number(quantities[st.key] ?? '0')
      if (!Number.isFinite(next)) continue
      if (next !== current) changes.push({ stockType: st.key, quantity: next })
    }

    if (changes.length === 0) {
      onOpenChange(false)
      return
    }

    try {
      for (const c of changes) {
        await upsert.mutateAsync({
          variantId: row.variantId,
          locationId: row.locationId,
          stockType: c.stockType,
          quantity: c.quantity,
          reason: reason || undefined,
        })
      }
      toast({
        title: t('updated'),
        description: t('updatedDescription', { count: changes.length }),
      })
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
          <DialogTitle>{t('title', { productName: row?.productName ?? '' })}</DialogTitle>
          <DialogDescription>
            SKU {row?.sku ?? ''} · {row?.locationName ?? ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {stockTypes.map((st) => {
            const current = row?.quantities[st.key] ?? 0
            return (
              <div key={st.key} className="flex items-center gap-3">
                <div className="w-32 text-sm">{st.label}</div>
                <div className="w-24 text-xs text-muted-foreground tabular-nums">
                  {t('was', { value: current.toLocaleString('de-DE') })}
                </div>
                <Input
                  type="number"
                  className="h-8 flex-1 tabular-nums"
                  value={quantities[st.key] ?? ''}
                  onChange={(e) => {
                    setQuantities((prev) => ({ ...prev, [st.key]: e.target.value }))
                  }}
                />
              </div>
            )
          })}

          <div>
            <Label htmlFor="reason" className="mb-1 block">
              {t('reason')}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
              }}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={upsert.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => {
              void handleSubmit()
            }}
            disabled={upsert.isPending}
          >
            {upsert.isPending ? tCommon('saving') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
