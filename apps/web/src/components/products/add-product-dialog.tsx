'use client'

import { useState } from 'react'

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

const UNIT_OPTIONS = [
  { value: 'piece', label: 'Piece' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'liter', label: 'Liter' },
  { value: 'box', label: 'Box' },
  { value: 'pallet', label: 'Pallet' },
]

interface AddProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps): JSX.Element {
  const create = useCreateProduct()
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('piece')
  const [batchTracking, setBatchTracking] = useState(false)
  const [description, setDescription] = useState('')

  function reset(): void {
    setName('')
    setSku('')
    setUnit('piece')
    setBatchTracking(false)
    setDescription('')
  }

  async function handleSubmit(): Promise<void> {
    try {
      await create.mutateAsync({
        name: name.trim(),
        sku: sku.trim(),
        unit,
        batchTracking,
        description: description.trim() || undefined,
      })
      toast({ title: 'Product created', description: name })
      reset()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create product'
      toast({ title: 'Create failed', description: message, variant: 'destructive' })
    }
  }

  const canSubmit = name.trim().length > 0 && sku.trim().length > 0 && !create.isPending

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
          <DialogTitle>Add product</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="product-name" className="mb-1 block">
              Product name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => { setName(e.target.value) }}
              placeholder="e.g. Recycled notebook A5"
            />
          </div>

          <div>
            <Label htmlFor="product-sku" className="mb-1 block">
              SKU <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-sku"
              value={sku}
              onChange={(e) => { setSku(e.target.value) }}
              placeholder="e.g. NB-A5-RE-01"
              className="font-mono"
            />
          </div>

          <div>
            <Label className="mb-1 block">Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
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
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-1 block">Batch / expiry tracking</Label>
              <p className="text-xs text-muted-foreground">Track stock per batch with expiry dates.</p>
            </div>
            <Switch checked={batchTracking} onCheckedChange={setBatchTracking} />
          </div>

          <div>
            <Label htmlFor="product-description" className="mb-1 block">
              Description
            </Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => { setDescription(e.target.value) }}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false) }} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => { void handleSubmit() }} disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
